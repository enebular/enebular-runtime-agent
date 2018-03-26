
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include <string.h>
#include <errno.h>
#include <sys/stat.h>
#include <sys/socket.h>
#include <sys/un.h>
#include "enebular_agent_mbed_cloud_connector.h"
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

EnebularAgentInterface::EnebularAgentInterface(EnebularAgentMbedCloudConnector * connector)
{
    _connector = connector;
    _is_connected = false;
}

EnebularAgentInterface::~EnebularAgentInterface()
{
}

bool EnebularAgentInterface::connected_check()
{
    if (!_is_connected) {
        errmsg("not connected\n");
        return false;
    }

    return true;
}

void EnebularAgentInterface::update_connected_state(bool connected)
{
    _is_connected = connected;

    notify_conntection_state();
}

void EnebularAgentInterface::handle_recv_msg(const char *msg)
{
    debug("received message: [%s]\n", msg);

    if (strcmp(msg, "ok") == 0) {
        if (_waiting_for_connect_ok) {
            _waiting_for_connect_ok = false;
            update_connected_state(true);
        }
    }
}

void EnebularAgentInterface::recv()
{
    ssize_t cnt;

    cnt = read(_agent_fd, &_recv_buf[_recv_cnt], RECV_BUF_SIZE - _recv_cnt);
    if (cnt < 0) {
        if (errno != EAGAIN && errno != EWOULDBLOCK) {
            errmsg("receive read error: %s\n", strerror(errno));
        }
        return;
    }
    if (cnt < 1) {
        return;
    }

    debug("received data (%ld)\n", cnt);
    _recv_cnt += cnt;

    if (_recv_buf[_recv_cnt-1] == END_OF_MSG_MARKER) {
        _recv_cnt--;
        _recv_buf[_recv_cnt] = '\0';
        handle_recv_msg(_recv_buf);
        _recv_buf = 0;
        return;
    }

    if (_recv_cnt == RECV_BUF_SIZE) {
        debug("receive buffer full. clearing.\n");
        _recv_buf = 0;
    }
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

    fd = socket(AF_UNIX, SOCK_STREAM | SOCK_NONBLOCK, 0);
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
    debug("connect...\n");

    if (_is_connected || _waiting_for_connect_ok) {
        return true;
    }

    if (!connect_agent()) {
        errmsg("connect failed\n");
        return false;
    }

    _waiting_for_connect_ok = true;

    debug("waiting for connect confirmation...\n");

    return true;
}

void EnebularAgentInterface::disconnect()
{
    if (!_waiting_for_connect_ok && !_is_connected) {
        return;
    }

    debug("disconnect...\n");

    disconnect_agent();

    _waiting_for_connect_ok = false;
    update_connected_state(false);
}

bool EnebularAgentInterface::is_connected()
{
    return _is_connected;
}

void EnebularAgentInterface::register_connection_state_callback(ConnectionStateCallback cb)
{
    _connection_state_callbacks.push_back(cb);
}

void EnebularAgentInterface::notify_conntection_state()
{
    vector<ConnectionStateCallback>::iterator it;
    for (it = _connection_state_callbacks.begin(); it != _connection_state_callbacks.end(); it++) {
        it->call();
    }
}

void EnebularAgentInterface::run()
{
    recv();
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
