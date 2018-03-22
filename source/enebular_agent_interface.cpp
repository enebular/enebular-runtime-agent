
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include <string.h>
#include <errno.h>
#include <sys/stat.h>
#include <sys/socket.h>
#include <sys/un.h>
#include "enebular_agent_interface.h"

#define MODULE_NAME             "enebular-agent"

#define SOC_IFACE_PATH          "/tmp/enebular-local-agent.socket"
#define CLIENT_IFACE_PATH_BASE  "/tmp/enebular-local-agent-client.socket-"

#define END_OF_MSG_MARKER       (0x1E) // RS (Record Separator)

#define CLIENT_IFACE_PERM       S_IRWXU
#define CONNECT_RETRIES_MAX     (5)
#define RECV_BUF_SIZE           (1024 * 1024)

#define errmsg(format, ...) fprintf(stderr, MODULE_NAME ": error: " format, ##__VA_ARGS__)

#define DEBUG
#ifdef DEBUG
#  define debug(format, ...) printf(MODULE_NAME ": debug: " format, ##__VA_ARGS__)
#else
#  define debug(format, ...)
#endif

EnebularAgentInterface::EnebularAgentInterface()
{
    _is_connected = false;
}

EnebularAgentInterface::~EnebularAgentInterface()
{
}

bool EnebularAgentInterface::connected_check()
{
    if (!_is_connected) {
        errmsg(MODULE_NAME " has not been initialized\n");
        return false;
    }

    return true;
}

/**
 * Note: The timeout currently functions as a per data chunk receive timeout,
 * not an overall total message receive timeout.
 */
bool EnebularAgentInterface::recv_msg_wait(int timeout_msec)
{
    struct timeval tv;
    fd_set readfds;
    int ret;
    int cnt;

    _recv_cnt = 0;

    while (1) {

        tv.tv_sec = timeout_msec / 1000;
        tv.tv_usec = (timeout_msec % 1000) * 1000;

        /* this is dependant on tv being updated (linux only) */
        while (tv.tv_sec != 0 && tv.tv_sec != 0) {
            FD_ZERO(&readfds);
            FD_SET(_agent_fd, &readfds);
            ret = select(_agent_fd + 1, &readfds, NULL, NULL, &tv);
            if (ret > 0) {
                break;
            }
        }
        if (tv.tv_sec == 0 && tv.tv_sec == 0) {
            debug("receive timed out\n");
            return false;
        }

        cnt = read(_agent_fd, _recv_buf, RECV_BUF_SIZE - _recv_cnt);
        if (cnt < 0) {
            errmsg("receive read error: %s\n", strerror(errno));
        }
        if (cnt > 0) {
            debug("received data (%d)\n", cnt);
        }
        _recv_cnt += cnt;

        if (_recv_buf[_recv_cnt-1] == END_OF_MSG_MARKER) {
            _recv_cnt--;
            _recv_buf[_recv_cnt] = '\0';
            debug("received message: [%s] (%d)\n", _recv_buf, _recv_cnt);
            break;
        }

        if (_recv_cnt == RECV_BUF_SIZE) {
            debug("receive buffer full\n");
            return false;
        }

    }

    return true;
}

bool EnebularAgentInterface::recv_msg_wait_for_match(const char *match, int timeout_msec)
{
    if (!recv_msg_wait(timeout_msec)) {
        return false;
    }

    if (strlen(match) != _recv_cnt) {
        return false;
    }

    return (memcmp(match, _recv_buf, _recv_cnt) == 0) ? true : false;
}

bool EnebularAgentInterface::ok_msg_wait()
{
    debug("wait for ok...\n");

    return recv_msg_wait_for_match("ok", 5 * 1000);
}

bool EnebularAgentInterface::connect_agent()
{
    int fd;
    struct sockaddr_un addr;
    char path[PATH_MAX];
    int retries = 0;
    int retry_wait_ms = 500;
    int ret;

    debug("connecting...\n");

    fd = socket(AF_UNIX, SOCK_STREAM, 0);
    if (fd < 0) {
        errmsg("failed to open socket: %s\n", strerror(errno));
        return false;
    }

    memset(&addr, 0, sizeof(addr));
    addr.sun_family = AF_UNIX;
    memset(&path, 0, sizeof(path));
    snprintf(path, sizeof(path), "%s%d", CLIENT_IFACE_PATH_BASE, getpid());
    strcpy(addr.sun_path, path);

    unlink(path);

    ret = bind(fd, (struct sockaddr *)&addr, sizeof(addr));
    if (ret < 0) {
        errmsg("failed to bind socket: %s\n", strerror(errno));
        goto err;
    }

    ret = chmod(addr.sun_path, CLIENT_IFACE_PERM);
    if (ret < 0) {
        errmsg("failed to chmod socket path: %s\n", strerror(errno));
        goto err;
    }

    while (1) {

        memset(&addr, 0, sizeof(addr));
        addr.sun_family = AF_UNIX;
        strcpy(addr.sun_path, SOC_IFACE_PATH);
        ret = ::connect(fd, (struct sockaddr *)&addr, sizeof(addr));
        if (ret == 0) {
            break;
        } else if (retries++ < CONNECT_RETRIES_MAX) {
            errmsg("connect failed, retrying in %dms\n", retry_wait_ms);
            usleep(retry_wait_ms * 1000);
            retry_wait_ms *= 2;
            continue;
        } else {
            errmsg("failed to connect: %s\n", strerror(errno));
            goto err;
        }

    }

    _agent_fd = fd;
    strncpy(_client_path, path, sizeof(_client_path));

    _recv_buf = (char *)calloc(1, RECV_BUF_SIZE);
    if (!_recv_buf) {
        errmsg("oom\n");
        goto err;
    }

    debug("connected\n");

    return true;
 err:
    unlink(path);
    close(fd);
    return false;
}

void EnebularAgentInterface::disconnect_agent()
{
    debug("disconnect...\n");

    free(_recv_buf);
    close(_agent_fd);
    unlink(_client_path);
}

bool EnebularAgentInterface::connect()
{
    debug("init...\n");

    if (_is_connected) {
        return true;
    }

    if (!connect_agent()) {
        errmsg("connect failed\n");
        return false;
    }

    if (!ok_msg_wait()) {
        errmsg("wait-for-ok failed\n");
        disconnect_agent();
        return false;
    }

    debug("ready\n");

    _is_connected = true;

    return true;
}

void EnebularAgentInterface::disconnect()
{
    if (!_is_connected) {
        return;
    }

    debug("cleanup...\n");

    disconnect_agent();

    _is_connected = false;
}

void EnebularAgentInterface::xfer_msg(const char *msg)
{
    char *full_msg;
    int msg_len;
    int write_cnt = 0;
    int zero_writes = 0;
    int cnt;

    if (!connected_check()) {
        return;
    }

    msg_len = strlen(msg);

    debug("send message: [%s] (%d)\n", msg, msg_len);

    full_msg = (char *)malloc(msg_len + 1);
    if (!full_msg) {
        errmsg("oom\n");
        return;
    }
    memcpy(full_msg, msg, msg_len);
    full_msg[msg_len] = END_OF_MSG_MARKER;
    msg_len++;

    while (1) {

        cnt = write(_agent_fd, full_msg+write_cnt, msg_len-write_cnt);
        if (cnt < 0) {
            errmsg("send message write error: %s\n", strerror(errno));
            break;
        } else if (cnt == 0) {
            zero_writes++;
            if (zero_writes > 5) {
                errmsg("send message: too many zero writes\n");
                break;
            }
        } else {
            zero_writes = 0;
            write_cnt += cnt;
        }

        if (write_cnt == msg_len) {
            break;
        }

    }

    free(full_msg);
}

void EnebularAgentInterface::send_message(const char *type, const char *content)
{
    char msg[1024*4];

    snprintf(msg, sizeof(msg)-1,
        "{"
            "\"type\": \"message\","
            "\"message\": {"
                "\"messageType\": \"%s\","
                "\"message\": %s"
            "}"
        "}",
        type,
        content
    );

    xfer_msg(msg);
}

void EnebularAgentInterface::notify_connection_state(bool connected)
{
    if (connected) {
        xfer_msg("{\"type\": \"connect\"}");
    } else {
        xfer_msg("{\"type\": \"disconnect\"}");
    }
}
