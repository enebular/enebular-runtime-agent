
#include <stdio.h>
#include "enebular_agent_mbed_cloud_connector.h"

EnebularAgentMbedCloudConnector::EnebularAgentMbedCloudConnector()
{
    _started = false;
}

EnebularAgentMbedCloudConnector::~EnebularAgentMbedCloudConnector()
{
}

void EnebularAgentMbedCloudConnector::client_connection_state_cb()
{
    bool connected = _mbed_cloud_client.is_connected();

    if (connected) {
        const char *device_id = _mbed_cloud_client.get_device_id();
        const char *name = _mbed_cloud_client.get_endpoint_name();
        if (device_id && strlen(device_id) > 0) {
            printf("Device ID: %s\n", device_id);
        }
        if (name && strlen(name) > 0) {
            printf("Endpoint name: %s\n", name);
        }
    }

    _agent.notify_connection_state(connected);
}

void EnebularAgentMbedCloudConnector::agent_manager_msg_cb(const char *type, const char *content)
{
    printf("agent-man message: type:%s, content:%s\n", type, content);
    _agent.send_message(type, content);
}

bool EnebularAgentMbedCloudConnector::startup(void *iface)
{
    if (_started) {
        return true;
    }

    /* connect to agent */
    if (!_agent.connect()) {
        printf("Failed to connect to agent\n");
        return false;
    }

    /* hook up client callbacks */
    ConnectionStateCallback connection_state_cb(this, &EnebularAgentMbedCloudConnector::client_connection_state_cb);
    AgentManagerMsgCallback agent_man_msg_cb(this, &EnebularAgentMbedCloudConnector::agent_manager_msg_cb);
    _mbed_cloud_client.register_connection_state_callback(connection_state_cb);
    _mbed_cloud_client.register_agent_manager_msg_callback(agent_man_msg_cb);

    /* client setup & connect */
    if (!_mbed_cloud_client.setup()) {
        printf("Client setup failed\n");
        return false;
    }
    if (!_mbed_cloud_client.connect(iface)) {
        printf("Client connect failed\n");
        return false;
    }

    return true;
}

void EnebularAgentMbedCloudConnector::shutdown()
{
    if (!_started) {
        return;
    }

    _mbed_cloud_client.disconnect();
    // todo: wait for disconnect state update

    _agent.notify_connection_state(false);
    _agent.disconnect();
}
