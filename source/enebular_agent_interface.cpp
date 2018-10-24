
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

#define SERVER_SOCKET_PATH      "/tmp/enebular-local-agent.socket"
#define CLIENT_SOCKET_PATH_BASE "/tmp/enebular-local-agent-client.socket-"

#define END_OF_MSG_MARKER       (0x1E) // RS (Record Separator)

#define CONNECT_RETRIES_MAX     (5)
#define SEND_BUF_SIZE           (100 * 1024)
#define RECV_BUF_SIZE           (1024 * 1024)

EnebularAgentInterface::EnebularAgentInterface(EnebularAgentMbedCloudConnector * connector):
    _connector(connector),
    _logger(Logger::get_instance()),
    _is_connected(false)

{
}

EnebularAgentInterface::~EnebularAgentInterface()
{
}

bool EnebularAgentInterface::connected_check()
{
    if (!_is_connected) {
        _logger->log_console(ERROR, "Agent: not connected");
        return false;
    }

    return true;
}

void EnebularAgentInterface::notify_conntection_state()
{
    vector<AgentConnectionChangeCB>::iterator it;
    for (it = _agent_conn_change_cbs.begin(); it != _agent_conn_change_cbs.end(); it++) {
        it->call();
    }
}

void EnebularAgentInterface::notify_registration_request()
{
    _registration_request_cb.call();
}

void EnebularAgentInterface::notify_connection_request(bool connect)
{
    _connection_request_cb.call(connect);
}

void EnebularAgentInterface::notify_agent_info(const char *info)
{
    _agent_info_cb.call(info);
}

void EnebularAgentInterface::update_connected_state(bool connected)
{
    _is_connected = connected;

    notify_conntection_state();
}

void EnebularAgentInterface::handle_recv_msg(const char *msg)
{
    _logger->log_console(DEBUG, "Agent: received message: [%s]", msg);

    if (strcmp(msg, "ok") == 0) {

        if (_waiting_for_connect_ok) {
            _waiting_for_connect_ok = false;
            update_connected_state(true);
        } else {
            _logger->log_console(INFO, "Agent: received unexpected ok");
        }

    } else if (strncmp(msg, "agent: ", strlen("agent: ")) == 0) {

        notify_agent_info(msg + strlen("agent: "));

    } else if (strcmp(msg, "register") == 0) {

        notify_registration_request();

    } else if (strcmp(msg, "connect") == 0) {

        notify_connection_request(true);

    } else if (strcmp(msg, "disconnect") == 0) {

        notify_connection_request(false);

    } else {

        _logger->log_console(INFO, "Agent: unsupported message: [%s]", msg);

    }
}

void EnebularAgentInterface::recv()
{
    ssize_t cnt;

    cnt = read(_agent_fd, &_recv_buf[_recv_cnt], RECV_BUF_SIZE - _recv_cnt);
    if (cnt < 0) {
        if (errno != EAGAIN && errno != EWOULDBLOCK) {
            _logger->log_console(ERROR, "Agent: receive read error: %s", strerror(errno));
        }
        return;
    }
    if (cnt < 1) {
        return;
    }

    _logger->log_console(DEBUG, "Agent: received data (%ld)", cnt);
    _recv_cnt += cnt;

    if (_recv_buf[_recv_cnt-1] == END_OF_MSG_MARKER) {
        _recv_cnt--;
        _recv_buf[_recv_cnt] = '\0';
        char delim[] = {END_OF_MSG_MARKER, '\0'};
        char *msg = strtok(_recv_buf, delim);
        while (msg) {
            handle_recv_msg(msg);
            msg = strtok(NULL, delim);
        }
        _recv_cnt = 0;
        return;
    }

    if (_recv_cnt == RECV_BUF_SIZE) {
        _logger->log_console(DEBUG, "Agent: receive buffer full. clearing.");
        _recv_cnt = 0;
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

    fd = socket(AF_UNIX, SOCK_STREAM | SOCK_NONBLOCK, 0);
    if (fd < 0) {
        _logger->log_console(ERROR, "Agent: failed to open socket: %s", strerror(errno));
        return false;
    }

    memset(&addr, 0, sizeof(addr));
    addr.sun_family = AF_UNIX;
    memset(&path, 0, sizeof(path));
    snprintf(path, sizeof(path), "%s%d", CLIENT_SOCKET_PATH_BASE, getpid());
    strcpy(addr.sun_path, path);

    unlink(path);

    ret = bind(fd, (struct sockaddr *)&addr, sizeof(addr));
    if (ret < 0) {
        _logger->log_console(ERROR, "Agent: failed to bind socket: %s", strerror(errno));
        goto err;
    }

    ret = chmod(addr.sun_path, S_IRWXU);
    if (ret < 0) {
        _logger->log_console(ERROR, "Agent: failed to chmod socket path: %s", strerror(errno));
        goto err;
    }

    while (1) {

        memset(&addr, 0, sizeof(addr));
        addr.sun_family = AF_UNIX;
        strcpy(addr.sun_path, SERVER_SOCKET_PATH);
        ret = ::connect(fd, (struct sockaddr *)&addr, sizeof(addr));
        if (ret == 0) {
            break;
        } else if (retries++ < CONNECT_RETRIES_MAX) {
            _logger->log_console(INFO, "Agent: connect failed, retrying in %dms", retry_wait_ms);
            usleep(retry_wait_ms * 1000);
            retry_wait_ms *= 2;
            continue;
        } else {
            _logger->log_console(ERROR, "Agent: failed to connect: %s", strerror(errno));
            goto err;
        }

    }

    _agent_fd = fd;
    strncpy(_client_path, path, sizeof(_client_path));

    _send_buf = (char *)calloc(1, SEND_BUF_SIZE);
    if (!_send_buf) {
        _logger->log_console(ERROR, "Agent: oom");
        goto err;
    }

    _recv_buf = (char *)calloc(1, RECV_BUF_SIZE);
    if (!_recv_buf) {
        free(_send_buf);
        _logger->log_console(ERROR, "Agent: oom");
        goto err;
    }

    _connector->register_wait_fd(_agent_fd);

    return true;
 err:
    unlink(path);
    close(fd);
    return false;
}

void EnebularAgentInterface::disconnect_agent()
{
    _connector->deregister_wait_fd(_agent_fd);

    free(_send_buf);
    free(_recv_buf);
    close(_agent_fd);
    unlink(_client_path);
}

bool EnebularAgentInterface::connect()
{
    _logger->log_console(DEBUG, "Agent: connect...");

    if (_is_connected || _waiting_for_connect_ok) {
        return true;
    }

    if (!connect_agent()) {
        _logger->log_console(ERROR, "Agent: connect failed");
        return false;
    }

    _waiting_for_connect_ok = true;

    _logger->log_console(DEBUG, "Agent: waiting for connect confirmation...");

    return true;
}

void EnebularAgentInterface::disconnect()
{
    if (!_waiting_for_connect_ok && !_is_connected) {
        return;
    }

    _logger->log_console(DEBUG, "Agent: disconnect...");

    disconnect_agent();

    _waiting_for_connect_ok = false;
    update_connected_state(false);
}

bool EnebularAgentInterface::is_connected()
{
    return _is_connected;
}

void EnebularAgentInterface::run()
{
    recv();
}

void EnebularAgentInterface::send_msg(const char *msg)
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

    _logger->log_console(DEBUG, "Agent: send message: [%s] (%d)", msg, msg_len);

    full_msg = (char *)malloc(msg_len + 1);
    if (!full_msg) {
        _logger->log_console(ERROR, "Agent: oom\n");
        return;
    }
    memcpy(full_msg, msg, msg_len);
    full_msg[msg_len] = END_OF_MSG_MARKER;
    msg_len++;

    while (1) {

        cnt = write(_agent_fd, full_msg+write_cnt, msg_len-write_cnt);
        if (cnt < 0) {
            if (errno != EINTR) {
                _logger->log_console(ERROR, "Agent: send message write error: %s", strerror(errno));
                break;
            }
        } else if (cnt == 0) {
            zero_writes++;
            if (zero_writes > 5) {
                _logger->log_console(ERROR, "Agent: send message: too many zero writes");
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
    snprintf(_send_buf, SEND_BUF_SIZE-1,
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

    send_msg(_send_buf);
}

/**
 * Todo:
 *  - JSON string escaping for message content
 */
void EnebularAgentInterface::send_log_message(const char *level, const char *prefix, const char *message)
{
    snprintf(_send_buf, SEND_BUF_SIZE-1,
        "{"
            "\"type\": \"log\","
            "\"log\": {"
                "\"level\": \"%s\","
                "\"message\": \"%s: %s\""
            "}"
        "}",
        level,
        prefix,
        message
    );

    send_msg(_send_buf);
}

void EnebularAgentInterface::notify_connection(bool connected)
{
    if (connected) {
        send_msg("{\"type\": \"connect\"}");
    } else {
        send_msg("{\"type\": \"disconnect\"}");
    }
}

void EnebularAgentInterface::notify_registration(bool registered, const char *device_id)
{
    snprintf(_send_buf, SEND_BUF_SIZE-1,
        "{"
            "\"type\": \"registration\","
            "\"registration\": {"
                "\"registered\": \"%s\","
                "\"deviceId\": \"%s\""
            "}"
        "}",
        registered ? "true" : "false",
        device_id ? device_id : ""
    );

    send_msg(_send_buf);
}

void EnebularAgentInterface::on_agent_connection_change(AgentConnectionChangeCB cb)
{
    _agent_conn_change_cbs.push_back(cb);
}

void EnebularAgentInterface::on_registration_request(ConnectorRegistrationRequestCB cb)
{
    _registration_request_cb = cb;
}

void EnebularAgentInterface::on_connection_request(ConnectorConnectionRequestCB cb)
{
    _connection_request_cb = cb;
}

void EnebularAgentInterface::on_agent_info(AgentInfoCB cb)
{
    _agent_info_cb = cb;
}
