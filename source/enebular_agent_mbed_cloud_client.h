
#ifndef ENEBULAR_AGENT_MBED_CLOUD_CLIENT_H
#define ENEBULAR_AGENT_MBED_CLOUD_CLIENT_H

#include "mbed-cloud-client/MbedCloudClient.h"
#include "mbed-client/m2mobject.h"

class M2MResource;
class M2MResourceInstance;

/**
 * Todo:
 *  - Standard device/security objects/resources
 */

class EnebularAgentMbedCloudClient {

public:

    /**
     * Constructor
     */
    EnebularAgentMbedCloudClient();

    /**
     * Deconstructor
     */
    ~EnebularAgentMbedCloudClient();

    /**
     * Sets up the client ready for connection.
     * 
     * @param iface A handler to the network interface on mbedOS, can be NULL on
     *              other platforms.
     */
    bool setup();

    bool connect(void *iface);

    bool disconnect();

    bool is_connected();

    // todo: agent-manager message notification
    // todo: connection status change notification

private:

    MbedCloudClient _cloud_client;
    //MbedCloudClientCallback _client_callback;
    M2MObjectList _object_list;
    bool _registered;

    M2MResource *_deploy_flow_download_url_res;
    M2MResource *_register_connection_id_res;
    M2MResource *_register_device_id_res;
    M2MResource *_register_auth_request_url_res;
    M2MResource *_register_agent_manager_base_url_res;
    M2MResource *_update_auth_access_token_res;
    M2MResource *_update_auth_id_token_res;
    M2MResource *_update_auth_state_res;

    void client_registered();
    void client_registration_updated();
    void client_unregistered();
    void client_error(int error_code);

    void setup_objects();

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
        execute_callback execute_cb);

    // PUT/GET
    M2MResource *add_rw_resource(
        uint16_t object_id,
        uint16_t instance_id,
        uint16_t resource_id,
        const char *resource_type,
        M2MResourceInstance::ResourceType data_type,
        const char *value,
        bool observable,
        value_updated_callback value_updated_cb);

    // POST
    M2MResource *add_execute_resource(
        uint16_t object_id,
        uint16_t instance_id,
        uint16_t resource_id,
        const char *resource_type,
        execute_callback execute_cb);

    void deploy_flow_download_url_cb(const char *name);
    void register_connection_id_cb(const char *name);
    void register_device_id_cb(const char *name);
    void register_auth_request_url_cb(const char *name);
    void register_agent_manager_base_url_cb(const char *name);
    void update_auth_access_token_cb(const char *name);
    void update_auth_id_token_cb(const char *name);
    void update_auth_state_cb(const char *name);

    //void example_execute_function(void * argument);

};

#endif // ENEBULAR_AGENT_MBED_CLOUD_CLIENT_H
