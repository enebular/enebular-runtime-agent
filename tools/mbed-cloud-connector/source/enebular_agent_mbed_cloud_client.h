
#ifndef ENEBULAR_AGENT_MBED_CLOUD_CLIENT_H
#define ENEBULAR_AGENT_MBED_CLOUD_CLIENT_H

#include <queue>
#include "mbed-cloud-client/MbedCloudClient.h"
#include "logger.h"

class EnebularAgentMbedCloudClientCallback: public MbedCloudClientCallback {
public:
    void value_updated(M2MBase *base, M2MBase::BaseType type);
};

class EnebularAgentMbedCloudConnector;

typedef FP0<void> ClientConnectionStateCB;
typedef FP2<void,const char *,const char *> AgentManagerMessageCB;

typedef struct _agent_msg {
    string type;
    string content;
} agent_msg_t;

/**
 * Todo:
 *  - Standard device/security objects/resources
 */

/**
 * The Mbed Cloud client for the connector.
 *
 * This provides a communication interface to enebular via Mbed Cloud. It
 * handles everything related to Mbed Cloud, including the definition of the
 * objects and resources.
 */
class EnebularAgentMbedCloudClient {

public:

    /**
     * Constructor
     */
    EnebularAgentMbedCloudClient(EnebularAgentMbedCloudConnector * connector);

    /**
     * Deconstructor
     */
    ~EnebularAgentMbedCloudClient();

    /**
     * Sets up the client ready for connection.
     */
    bool setup();

    /**
     * Runs the client's main work.
     *
     * This is designed to be run from the connector's main loop and it will not
     * block.
     */
    void run();

    /**
     * Connects to Mbed Cloud.
     * 
     * @param iface A handler to the network interface.
     */
    bool connect(void *iface);

    /**
     * Disconnects from Mbed Cloud.
     */
    void disconnect();

    /**
     * Checks if the client is currently connecting or not.
     */
    bool is_connecting();

    /**
     * Checks if the client is currently connected or not.
     */
    bool is_connected();

    /**
     * Gets the device ID.
     */
    const char *get_device_id(void);

    /**
     * Gets the endpoint name.
     */
    const char *get_endpoint_name(void);

    /**
     * Sets the agent info (type and version JSON).
     * 
     * @param info Agent info
     */
    void set_agent_info(const char *info);

    /**
     * Adds a client connection state change callback.
     *
     * Multiple callbackes can be added.
     *
     * @param cb Callback
     */
    void on_connection_change(ClientConnectionStateCB cb);

    /**
     * Adds an agent manager message callback.
     *
     * Multiple callbackes can be added.
     *
     * @param cb Callback
     */
    void on_agent_manager_message(AgentManagerMessageCB cb);

    // todo: update handler reg

private:

    EnebularAgentMbedCloudConnector * _connector;
    Logger *_logger;
    EnebularAgentMbedCloudClientCallback *_clientCallback;

    MbedCloudClient _cloud_client;
    M2MObjectList _object_list;
    vector<ClientConnectionStateCB> _connection_state_callbacks;
    vector<AgentManagerMessageCB> _agent_man_msg_callbacks;

    /* the following are thread-shared */
    bool _connecting;
    bool _registered;
    bool _registered_state_updated;
    queue<agent_msg_t> _agent_man_msgs;
    char *_agent_info;
    pthread_mutex_t _lock;

    M2MResource *_deploy_flow_download_url_res;
    M2MResource *_register_connection_id_res;
    M2MResource *_register_device_id_res;
    M2MResource *_register_auth_request_url_res;
    M2MResource *_register_agent_manager_base_url_res;
    M2MResource *_update_auth_access_token_res;
    M2MResource *_update_auth_id_token_res;
    M2MResource *_update_auth_state_res;
    M2MResource *_agent_info_res;
    M2MResource *_device_state_change_res;

    unsigned long long _register_connection_id_time;
    unsigned long long _register_device_id_time;
    unsigned long long _register_auth_request_url_time;
    unsigned long long _register_agent_manager_base_url_time;
    unsigned long long _update_auth_access_token_time;
    unsigned long long _update_auth_id_token_time;
    unsigned long long _update_auth_state_time;

    void client_registered();
    void client_registration_updated();
    void client_unregistered();
    void client_error(int error_code);

    bool init_fcc();
    void setup_objects();
    void update_registered_state(bool registered);

    M2MResource *add_resource(
        uint16_t object_id,
        uint16_t instance_id,
        uint16_t resource_id,
        const char *resource_type,
        M2MResourceInstance::ResourceType data_type,
        M2MBase::Operation operations,
        const char *value,
        bool observable,
        value_updated_callback value_updated_cb,
        execute_callback execute_cb,
        uint32_t max_age);

    // PUT/GET
    M2MResource *add_rw_resource(
        uint16_t object_id,
        uint16_t instance_id,
        uint16_t resource_id,
        const char *resource_type,
        M2MResourceInstance::ResourceType data_type,
        const char *value,
        bool observable,
        value_updated_callback value_updated_cb,
        uint32_t max_age);

    // POST
    M2MResource *add_execute_resource(
        uint16_t object_id,
        uint16_t instance_id,
        uint16_t resource_id,
        const char *resource_type,
        execute_callback execute_cb,
        uint32_t max_age);

    void deploy_flow_download_url_cb(const char *name);
    void register_connection_id_cb(const char *name);
    void register_device_id_cb(const char *name);
    void register_auth_request_url_cb(const char *name);
    void register_agent_manager_base_url_cb(const char *name);
    void update_auth_access_token_cb(const char *name);
    void update_auth_id_token_cb(const char *name);
    void update_auth_state_cb(const char *name);
    void agent_info_cb(const char *name);
    void device_state_change_cb(const char *name);

    //void example_execute_function(void * argument);

    void process_deploy_flow_update();
    void process_register_update();
    void process_update_auth_update();
    void process_device_state_change();

    void queue_agent_man_msg(const char *type, const char *content);

    void notify_conntection_state();
    void notify_agent_man_msgs();

};

#endif // ENEBULAR_AGENT_MBED_CLOUD_CLIENT_H
