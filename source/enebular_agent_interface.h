
#ifndef ENEBULAR_AGENT_INTERFACE_H
#define ENEBULAR_AGENT_INTERFACE_H

#include <limits.h>
#include "mbed-cloud-client/MbedCloudClient.h"
#include "logger.h"

class EnebularAgentMbedCloudConnector;
class Logger;

typedef FP0<void> AgentConnectionChangeCB;
typedef FP0<void> ConnectorRegistrationRequestCB;
typedef FP1<void, bool> ConnectorConnectionRequestCB;
typedef FP1<void, const char *> AgentInfoCB;

/**
 * The enebular agent interface.
 *
 * This class provides a communication interface to the main enebular agent.
 */
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
     * This is designed to be run from the connector's main loop and it will not
     * block.
     */
    void run();

    /**
     * Checks if the agent is connected or not.
     */
    bool is_connected();

    /**
     * Adds an agent connection state change callback.
     *
     * Multiple callbackes can be added.
     *
     * @param cb Callback
     */
    void on_agent_connection_change(AgentConnectionChangeCB cb);

    /**
     * Sets the connector registration request callback.
     *
     * Only one callback can be set.
     *
     * @param cb Callback
     */
    void on_registration_request(ConnectorRegistrationRequestCB cb);

    /**
     * Sets the connector connection request callback.
     *
     * Only one callback can be set.
     *
     * @param cb Callback
     */
    void on_connection_request(ConnectorConnectionRequestCB cb);

    /**
     * Sets the agent info callback.
     *
     * Only one callback can be set.
     *
     * @param cb Callback
     */
    void on_agent_info(AgentInfoCB cb);

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
     * Note that the message is sent to the agent packaged in JSON, but the
     * interface currently does not support properly stringifying the message
     * content. Therefore the message cannot contain any character that will
     * interfere with JSON formatting.
     *
     * @param level   Log level
     * @param prefix  Log message prefix
     * @param message Log message
     */
    void send_log_message(const char *level, const char *prefix, const char *message);

    /**
     * Notify the agent of the connector's connection state.
     *
     * @param connected Connected or not
     */
    void notify_connection(bool connected);

    /**
     * Notify the agent of the connector's registration state.
     *
     * @param registered Registered or not
     * @param device_id  [description]
     */
    void notify_registration(bool registered, const char *device_id);

private:

    EnebularAgentMbedCloudConnector * _connector;
    Logger *_logger;
    int _agent_fd;
    char _client_path[PATH_MAX];
    char *_send_buf;
    char *_recv_buf;
    int _recv_cnt;
    bool _waiting_for_connect_ok;
    bool _is_connected;
    vector<AgentConnectionChangeCB> _agent_conn_change_cbs;
    ConnectorRegistrationRequestCB _registration_request_cb;
    ConnectorConnectionRequestCB _connection_request_cb;
    AgentInfoCB _agent_info_cb;

    bool connect_agent();
    void disconnect_agent();
    bool connected_check();
    void recv();
    void handle_recv_msg(const char *msg);
    void send_msg(const char *msg);
    void notify_conntection_state();
    void notify_registration_request();
    void notify_connection_request(bool connect);
    void notify_agent_info(const char *info);
    void update_connected_state(bool connected);

};

#endif // ENEBULAR_AGENT_INTERFACE_H
