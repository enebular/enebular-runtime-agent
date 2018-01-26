
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include <string.h>
#include <errno.h>
#include <limits.h>
#include <sys/stat.h>
#include <sys/socket.h>
#include <sys/un.h>
#include "enebular_agent.h"

#define MODULE_NAME             "enebular-agent"

#define SOC_IFACE_PATH          "/tmp/enebular-local-agent.socket"
#define CLIENT_IFACE_PATH_BASE  "/tmp/enebular-local-agent-client.socket-"

#define END_OF_MSG_MARKER       (0x1E) // RS (Record Separator)

#define CLIENT_IFACE_PERM       S_IRWXU
#define CONNECT_RETRIES_MAX     (5)
#define RECV_BUF_SIZE           (1024 * 1024)

#define errmsg(format, ...) fprintf(stderr, MODULE_NAME ": error: " format, ##__VA_ARGS__)

//#define DEBUG
#ifdef DEBUG
#  define debug(format, ...) printf(MODULE_NAME ": debug: " format, ##__VA_ARGS__)
#else
#  define debug(format, ...)
#endif

struct enebular_agent {
    int server_fd;
    char client_path[PATH_MAX];
    char * recv_buf;
    int recv_cnt;
    int inited;
};

static struct enebular_agent agent;

static int init_check(void)
{
    if (!agent.inited) {
        errmsg(MODULE_NAME " has not been initialized\n");
        return -1;
    }

    return 0;
}

/**
 * Note: The timeout currently functions as a per data chunk receive timeout,
 * not an overall total message receive timeout.
 */
static int recv_msg_wait(int timeout_msec)
{
    struct timeval tv;
    fd_set readfds;
    int ret;
    int cnt;

    agent.recv_cnt = 0;

    while (1) {

        tv.tv_sec = timeout_msec / 1000;
        tv.tv_usec = (timeout_msec % 1000) * 1000;

        /* this is dependant on tv being updated (linux only) */
        while (tv.tv_sec != 0 && tv.tv_sec != 0) {
            FD_ZERO(&readfds);
            FD_SET(agent.server_fd, &readfds);
            ret = select(agent.server_fd + 1, &readfds, NULL, NULL, &tv);
            if (ret > 0) {
                break;
            }
        }
        if (tv.tv_sec == 0 && tv.tv_sec == 0) {
            debug("receive timed out\n");
            return -1;
        }

        cnt = read(agent.server_fd, agent.recv_buf, RECV_BUF_SIZE - agent.recv_cnt);
        if (cnt < 0) {
            errmsg("receive read error: %s\n", strerror(errno));
        }
        if (cnt > 0) {
            debug("received data (%d)\n", cnt);
        }
        agent.recv_cnt += cnt;

        if (agent.recv_buf[agent.recv_cnt-1] == END_OF_MSG_MARKER) {
            agent.recv_cnt--;
            agent.recv_buf[agent.recv_cnt] = '\0';
            debug("received message: [%s] (%d)\n", agent.recv_buf, agent.recv_cnt);
            break;
        }

        if (agent.recv_cnt == RECV_BUF_SIZE) {
            debug("receive buffer full\n");
            return -1;
        }

    }

    return 0;
}

static int recv_msg_wait_for_match(char *match, int timeout_msec)
{
    int ret;

    ret = recv_msg_wait(timeout_msec);
    if (ret < 0) {
        return -1;
    }

    int match_len = strlen(match);
    if (match_len != agent.recv_cnt) {
        return -1;
    }

    return (memcmp(match, agent.recv_buf, agent.recv_cnt) == 0) ? 0 : -1;
}

static int wait_for_ok_msg(void)
{
    debug("wait for ok...\n");

    return recv_msg_wait_for_match("ok", 5 * 1000);
}

static int connect_server(void)
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
        return -1;
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
        ret = connect(fd, (struct sockaddr *)&addr, sizeof(addr));
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

    agent.server_fd = fd;
    strncpy(agent.client_path, path, sizeof(agent.client_path));

    agent.recv_buf = calloc(1, RECV_BUF_SIZE);
    if (!agent.recv_buf) {
        errmsg("oom\n");
        goto err;
    }

    debug("connected\n");

    return 0;
 err:
    unlink(path);
    close(fd);
    return -1;
}

static void disconnect_server(void)
{
    debug("disconnect...\n");

    free(agent.recv_buf);
    close(agent.server_fd);
    unlink(agent.client_path);
}

int enebular_agent_init(void)
{
    int ret;

    debug("init...\n");

    if (agent.inited) {
        return 0;
    }

    ret = connect_server();
    if (ret < 0) {
        errmsg("connect failed\n");
        return -1;
    }

    ret = wait_for_ok_msg();
    if (ret < 0) {
        errmsg("wait-for-ok failed\n");
        disconnect_server();
        return -1;
    }

    debug("ready\n");

    agent.inited = 1;

    return 0;
}

void enebular_agent_cleanup(void)
{
    if (!agent.inited) {
        return;
    }

    debug("cleanup...\n");

    disconnect_server();

    agent.inited = 0;
}

static int agent_send_msg(const char *msg)
{
    char *full_msg;
    int msg_len;
    int write_cnt = 0;
    int zero_writes = 0;
    int cnt;

    if (init_check() < 0) {
        return -1;
    }

    msg_len = strlen(msg);

    debug("send message: [%s] (%d)\n", msg, msg_len);

    full_msg = malloc(msg_len + 1);
    if (!full_msg) {
        errmsg("oom\n");
        return -1;
    }
    memcpy(full_msg, msg, msg_len);
    full_msg[msg_len] = END_OF_MSG_MARKER;
    msg_len++;

    while (1) {

        cnt = write(agent.server_fd, full_msg+write_cnt, msg_len-write_cnt);
        if (cnt < 0) {
            errmsg("send message write error: %s\n", strerror(errno));
            goto err;
        } else if (cnt == 0) {
            zero_writes++;
            if (zero_writes > 5) {
                errmsg("send message: too many zero writes\n");
                goto err;
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

    return 0;
 err:
    free(full_msg);
    return -1;
}

int enebular_agent_send_msg(const char *type, const char *content)
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

    return agent_send_msg(msg);
}

int enebular_agent_notify_conn_state(bool connected)
{
    if (connected) {
        return agent_send_msg("{\"type\": \"connect\"}");
    } else {
        return agent_send_msg("{\"type\": \"disconnect\"}");
    }
}
