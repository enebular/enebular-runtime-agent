
#ifndef ENEBULAR_AGENT_INTERFACE_H
#define ENEBULAR_AGENT_INTERFACE_H

#include <limits.h>
#include "mbed-cloud-client/MbedCloudClient.h"

class EnebularAgentMbedCloudConnector;

typedef FP0<void> AgentConnectionStateCB;

class EnebularAgentInterface {

public:

    /**
     * Constructor
     */
    EnebularAgentInterface(EnebularAgentMbedCloudConnector * connector);

    /**
     * Deconstructor
     */
    ~EnebularAgentInterface();

    /**
     * Connect to the agent.
     */
    bool connect();

    /**
     * Disconnect from the agent.
     */
    void disconnect();

    /**
     * Run the agent interface's main work.
     *
     * This is designed to be run from the app's main loop and it will not
     * block.
     */
    void run();

    /**
     * Checks if the agent is connected or not.
     */
    bool is_connected();

    /**
     * Register a connection state change callback.
     *
     * @param cb Callback
     */
    void register_connection_state_callback(AgentConnectionStateCB cb);

    /**
     * Send an agent-manager message to the agent.
     *
     * @param type      Message type
     * @param content   Message content
     */
    void send_message(const char *type, const char *content);

    /**
     * Send a log message to the agent.
     *
     * @param level   Log level
     * @param message Log message
     */
    void send_log_message(const char *level, const char *prefix, const char *message);

    // handle (connector) connection state change request

    /**
     * Notify the agent of the (connector's) connection state.
     *
     * @param connected Connected or not
     */
    void notify_connector_connection_state(bool connected);

    // handle device reg state change request
    // notify device reg state (with deviceID)

private:

    EnebularAgentMbedCloudConnector * _connector;

    int _agent_fd;
    char _client_path[PATH_MAX];
    char *_recv_buf;
    int _recv_cnt;
    bool _waiting_for_connect_ok;
    bool _is_connected;
    vector<AgentConnectionStateCB> _connection_state_callbacks;

    bool connect_agent();
    void disconnect_agent();
    bool connected_check();
    void recv();
    void handle_recv_msg(const char *msg);
    void send_msg(const char *msg);
    void notify_conntection_state();
    void update_connected_state(bool connected);

};

#endif // ENEBULAR_AGENT_INTERFACE_H
