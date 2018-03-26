
#ifndef ENEBULAR_AGENT_INTERFACE_H
#define ENEBULAR_AGENT_INTERFACE_H

#include <limits.h>
#include "mbed-cloud-client/MbedCloudClient.h"

class EnebularAgentMbedCloudConnector;

typedef FP0<void> ConnectionStateCallback;

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
     * Checks if the agent is connected or not.
     */
    bool is_connected();

    void register_connection_state_callback(ConnectionStateCallback cb);

    /**
     * Run the agent interface's main work.
     *
     * This is designed to be run from the app's main loop and it will not
     * block.
     */
    void run();

    /**
     * Send an agent-manager message to the agent.
     *
     * @param type      Message type
     * @param content   Message content
     */
    void send_message(const char *type, const char *content);

    // void send_log_message();

    // handle connection state change request

    /**
     * Notify the agent of the (connector's) connection state.
     *
     * @param connected Connected or not
     */
    void notify_connection_state(bool connected);

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
    vector<ConnectionStateCallback> _connection_state_callbacks;

    bool connect_agent();
    void disconnect_agent();
    void xfer_msg(const char *msg);
    bool connected_check();
    void notify_conntection_state();
    void recv();
    void handle_recv_msg(const char *msg);
    void update_connected_state(bool connected);

};

#endif // ENEBULAR_AGENT_INTERFACE_H
