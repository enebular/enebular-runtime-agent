
#include <stdio.h>
#include <unistd.h>
#include <errno.h>
#include <string.h>
#include <sys/epoll.h>
#include <sys/eventfd.h>
#include "enebular_agent_mbed_cloud_connector.h"

#define MAX_EPOLL_EVENT_CNT (10)

EnebularAgentMbedCloudConnector::EnebularAgentMbedCloudConnector()
{
    _agent = new EnebularAgentInterface(this);
    _mbed_cloud_client = new EnebularAgentMbedCloudClient(this);
    _started = false;
    _running = false;
}

EnebularAgentMbedCloudConnector::~EnebularAgentMbedCloudConnector()
{
    delete _mbed_cloud_client;
    delete _agent;
}

void EnebularAgentMbedCloudConnector::agent_connection_state_cb()
{
    bool connected = _agent->is_connected();

    printf("agent: %s\n", connected ? "connected" : "disconnected");
}

void EnebularAgentMbedCloudConnector::client_connection_state_cb()
{
    bool connected = _mbed_cloud_client->is_connected();

    if (connected) {
        const char *device_id = _mbed_cloud_client->get_device_id();
        const char *name = _mbed_cloud_client->get_endpoint_name();
        if (device_id && strlen(device_id) > 0) {
            printf("Device ID: %s\n", device_id);
        }
        if (name && strlen(name) > 0) {
            printf("Endpoint name: %s\n", name);
        }
    }

    if (_agent->is_connected()) {
        _agent->notify_connection_state(connected);
    }
}

void EnebularAgentMbedCloudConnector::agent_manager_msg_cb(const char *type, const char *content)
{
    printf("agent-man message: type:%s, content:%s\n", type, content);

    if (_agent->is_connected()) {
        _agent->send_message(type, content);
    }
}

bool EnebularAgentMbedCloudConnector::init_events()
{
    struct epoll_event ev;

    _kick_fd = eventfd(0, 0);
    if (_kick_fd < 0) {
        return false;
    }

    _epoll_fd = epoll_create1(0);
    if (_epoll_fd == -1) {
        close(_kick_fd);
        return false;
    }

    ev.events = EPOLLIN;
    ev.data.fd = _kick_fd;
    if (epoll_ctl(_epoll_fd, EPOLL_CTL_ADD, _kick_fd, &ev) < 0) {
        close(_kick_fd);
        close(_epoll_fd);
        return false;
    }

    return true;
}

void EnebularAgentMbedCloudConnector::uninit_events()
{
    close(_kick_fd);
    close(_epoll_fd);
}

void EnebularAgentMbedCloudConnector::wait_for_events()
{
    struct epoll_event events[MAX_EPOLL_EVENT_CNT];
    int nfds;

    //printf("waiting...\n");

    while (1) {
        nfds = epoll_wait(_epoll_fd, events, MAX_EPOLL_EVENT_CNT, 100);
        if (nfds < 0) {
            if (errno != EINTR) {
                printf("wait failed: %s\n", strerror(errno));
                break;
            }
        } else if (nfds == 0) {
            printf("timeout\n");
            break;
        } else {
            break;
        }
    }

    for (int i = 0; i < nfds; ++i) {
        printf("triggered fd: %d\n", events[i].data.fd);
        if (events[i].data.fd == _kick_fd) {
            uint64_t val;
            ssize_t ret = read(_kick_fd, &val, sizeof(val));
            if (ret != sizeof(val)) {
                printf("kick fd read failed\n");
            }
        }
    }

    //printf("finished waiting\n");
}

void EnebularAgentMbedCloudConnector::kick()
{
    uint64_t val = 1;
    ssize_t ret;

    do {
        ret = write(_kick_fd, &val, sizeof(val));
    } while (ret < 0 && (errno == EAGAIN || errno == EINTR));
    if (ret != sizeof(val)) {
        printf("Failed to write kick\n");
    }
}

void EnebularAgentMbedCloudConnector::register_wait_fd(int fd)
{
    //
}

void EnebularAgentMbedCloudConnector::deregister_wait_fd(int fd)
{
    //
}

bool EnebularAgentMbedCloudConnector::startup(void *iface)
{
    if (_started) {
        return true;
    }

    if (!init_events()) {
        printf("Failed to init events\n");
        return false;
    }

    /* hook up agent callbacks */
    ConnectionStateCallback agent_conn_state_cb(this, &EnebularAgentMbedCloudConnector::agent_connection_state_cb);
    _agent->register_connection_state_callback(agent_conn_state_cb);

    /* connect to agent */
    if (!_agent->connect()) {
        printf("Failed to connect to agent\n");
        return false;
    }

    /* hook up client callbacks */
    ConnectionStateCallback client_conn_state_cb(this, &EnebularAgentMbedCloudConnector::client_connection_state_cb);
    AgentManagerMsgCallback agent_man_msg_cb(this, &EnebularAgentMbedCloudConnector::agent_manager_msg_cb);
    _mbed_cloud_client->register_connection_state_callback(client_conn_state_cb);
    _mbed_cloud_client->register_agent_manager_msg_callback(agent_man_msg_cb);

    /* client setup & connect client */
    if (!_mbed_cloud_client->setup()) {
        printf("Client setup failed\n");
        return false;
    }
    if (!_mbed_cloud_client->connect(iface)) {
        printf("Client connect failed\n");
        return false;
    }

    _started = true;

    return true;
}

void EnebularAgentMbedCloudConnector::shutdown()
{
    if (!_started) {
        return;
    }

    printf("Shutting down...\n");

    _mbed_cloud_client->disconnect();
    while (_mbed_cloud_client->is_connected()) {
        usleep(100*1000);
    }

    _agent->notify_connection_state(false);
    _agent->disconnect();

    uninit_events();
}

void EnebularAgentMbedCloudConnector::run()
{
    if (_running) {
        return;
    }

    _running = true;

    while (_running) {
        _agent->run();
        _mbed_cloud_client->run();
        wait_for_events();
    }
}

void EnebularAgentMbedCloudConnector::halt()
{
    _running = false;
}
