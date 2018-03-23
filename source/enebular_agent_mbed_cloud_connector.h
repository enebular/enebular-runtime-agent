
#ifndef ENEBULAR_AGENT_MBED_CLOUD_CONNECTOR_H
#define ENEBULAR_AGENT_MBED_CLOUD_CONNECTOR_H

#include "enebular_agent_mbed_cloud_client.h"
#include "enebular_agent_interface.h"

class EnebularAgentMbedCloudConnector {

public:

    /**
     * Constructor
     */
    EnebularAgentMbedCloudConnector();

    /**
     * Deconstructor
     */
    ~EnebularAgentMbedCloudConnector();

    /**
     * Start up the connector.
     *
     * @param iface A handler to the network interface.
     */
    bool startup(void *iface);

    /**
     * Shut down the connector.
     */
    void shutdown();

private:

    EnebularAgentMbedCloudClient _mbed_cloud_client;
    EnebularAgentInterface _agent;
    bool _started;

    void client_connection_state_cb();
    void agent_manager_msg_cb(const char *type, const char *content);

};

#endif // ENEBULAR_AGENT_MBED_CLOUD_CONNECTOR_H
