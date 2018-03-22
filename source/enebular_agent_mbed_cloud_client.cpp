
#include <cstdio>
#include "enebular_agent_mbed_cloud_client.h"

#define OBJECT_ID_DEPLOY_FLOW       (26242)
#define OBJECT_ID_REGISTER          (26243)
#define OBJECT_ID_AUTH_TOKEN        (26244)
#define OBJECT_ID_CONFIG            (26245)

#define RESOURCE_ID_DOWNLOAD_URL            (26241)
#define RESOURCE_ID_CONNECTION_ID           (26241)
#define RESOURCE_ID_DEVICE_ID               (26242)
#define RESOURCE_ID_AUTH_REQUEST_URL        (26243)
#define RESOURCE_ID_AGENT_MANAGER_BASE_URL  (26244)
#define RESOURCE_ID_ACCEESS_TOKEN           (26241)
#define RESOURCE_ID_ID_TOKEN                (26242)
#define RESOURCE_ID_STATE                   (26243)
#define RESOURCE_ID_MONITOR_ENABLE          (26241)

#ifdef MBED_CLOUD_CLIENT_SUPPORT_UPDATE
void update_authorize(int32_t request);
void update_progress(uint32_t progress, uint32_t total);
#endif

EnebularAgentMbedCloudClient::EnebularAgentMbedCloudClient()
{
    _registered = false;
}

EnebularAgentMbedCloudClient::~EnebularAgentMbedCloudClient()
{
}

void EnebularAgentMbedCloudClient::setup_objects()
{
    _deploy_flow_download_url_res = add_rw_resource(
        OBJECT_ID_DEPLOY_FLOW, 0, RESOURCE_ID_DOWNLOAD_URL, "download_url",
        M2MResourceInstance::STRING, NULL, false,
        value_updated_callback(this, &EnebularAgentMbedCloudClient::deploy_flow_download_url_cb));

    _register_connection_id_res = add_rw_resource(
        OBJECT_ID_REGISTER, 0, RESOURCE_ID_CONNECTION_ID, "connection_id",
        M2MResourceInstance::STRING, NULL, false,
        value_updated_callback(this, &EnebularAgentMbedCloudClient::register_connection_id_cb));
    _register_device_id_res = add_rw_resource(
        OBJECT_ID_REGISTER, 0, RESOURCE_ID_DEVICE_ID, "device_id",
        M2MResourceInstance::STRING, NULL, false,
        value_updated_callback(this, &EnebularAgentMbedCloudClient::register_device_id_cb));
    _register_auth_request_url_res = add_rw_resource(
        OBJECT_ID_REGISTER, 0, RESOURCE_ID_AUTH_REQUEST_URL, "auth_request_url",
        M2MResourceInstance::STRING, NULL, false,
        value_updated_callback(this, &EnebularAgentMbedCloudClient::register_auth_request_url_cb));
    _register_agent_manager_base_url_res = add_rw_resource(
        OBJECT_ID_REGISTER, 0, RESOURCE_ID_AGENT_MANAGER_BASE_URL, "agent_manager_base_url",
        M2MResourceInstance::STRING, NULL, false,
        value_updated_callback(this, &EnebularAgentMbedCloudClient::register_agent_manager_base_url_cb));

    _update_auth_access_token_res = add_rw_resource(
        OBJECT_ID_AUTH_TOKEN, 0, RESOURCE_ID_ACCEESS_TOKEN, "access_token",
        M2MResourceInstance::STRING, NULL, false,
        value_updated_callback(this, &EnebularAgentMbedCloudClient::update_auth_access_token_cb));
    _update_auth_id_token_res = add_rw_resource(
        OBJECT_ID_AUTH_TOKEN, 0, RESOURCE_ID_ID_TOKEN, "id_token",
        M2MResourceInstance::STRING, NULL, false,
        value_updated_callback(this, &EnebularAgentMbedCloudClient::update_auth_id_token_cb));
    _update_auth_state_res = add_rw_resource(
        OBJECT_ID_AUTH_TOKEN, 0, RESOURCE_ID_STATE, "state",
        M2MResourceInstance::STRING, NULL, false,
        value_updated_callback(this, &EnebularAgentMbedCloudClient::update_auth_state_cb));
}

void EnebularAgentMbedCloudClient::deploy_flow_download_url_cb(const char *name)
{
    printf("deploy_flow_download_url: %s\n", _deploy_flow_download_url_res->get_value_string().c_str());
}

void EnebularAgentMbedCloudClient::register_connection_id_cb(const char *name)
{
    printf("register_connection_id: %s\n", _register_connection_id_res->get_value_string().c_str());
}

void EnebularAgentMbedCloudClient::register_device_id_cb(const char *name)
{
    printf("register_device_id: %s\n", _register_device_id_res->get_value_string().c_str());
}

void EnebularAgentMbedCloudClient::register_auth_request_url_cb(const char *name)
{
    printf("register_auth_request_url: %s\n", _register_auth_request_url_res->get_value_string().c_str());
}

void EnebularAgentMbedCloudClient::register_agent_manager_base_url_cb(const char *name)
{
    printf("register_agent_manager_base_url: %s\n", _register_agent_manager_base_url_res->get_value_string().c_str());
}

void EnebularAgentMbedCloudClient::update_auth_access_token_cb(const char *name)
{
    printf("update_auth_access_token: %s\n", _update_auth_access_token_res->get_value_string().c_str());
}

void EnebularAgentMbedCloudClient::update_auth_id_token_cb(const char *name)
{
    printf("update_auth_id_token: %s\n", _update_auth_id_token_res->get_value_string().c_str());
}

void EnebularAgentMbedCloudClient::update_auth_state_cb(const char *name)
{
    printf("update_auth_state: %s\n", _update_auth_state_res->get_value_string().c_str());
}

bool EnebularAgentMbedCloudClient::setup()
{
    setup_objects();

    _cloud_client.add_objects(_object_list);

    _cloud_client.on_registered(this, &EnebularAgentMbedCloudClient::client_registered);
    _cloud_client.on_registration_updated(this, &EnebularAgentMbedCloudClient::client_registration_updated);
    _cloud_client.on_unregistered(this, &EnebularAgentMbedCloudClient::client_unregistered);
    _cloud_client.on_error(this, &EnebularAgentMbedCloudClient::client_error);

#ifdef MBED_CLOUD_CLIENT_SUPPORT_UPDATE
    _cloud_client.set_update_authorize_handler(update_authorize);
    _cloud_client.set_update_progress_handler(update_progress);
#endif

    //todo: set_update_callback(MbedCloudClientCallback *callback)

    return true;
}

bool EnebularAgentMbedCloudClient::connect(void *iface)
{
    printf("Client connecting...\n");

    bool setup = _cloud_client.setup(iface);
    if (!setup) {
        return false;
    }
}

bool EnebularAgentMbedCloudClient::disconnect()
{
    printf("Client disconnecting...\n");

    _cloud_client.close();
}

bool EnebularAgentMbedCloudClient::is_connected()
{
    return _registered;
}

void EnebularAgentMbedCloudClient::client_registered()
{
    _registered = true;

    printf("Client registered\n");

    const ConnectorClientEndpointInfo * info = _cloud_client.endpoint_info();
    if (info) {
        const char *device_id = info->internal_endpoint_name.c_str();
        const char *name = info->endpoint_name.c_str();
        printf("Device ID: %s", device_id);
        if (name && strlen(name) > 0) {
            printf(" (name: %s)", name);
        }
        printf("\n");
    }
}

void EnebularAgentMbedCloudClient::client_registration_updated()
{
    printf("Client registration updated\n");
}

void EnebularAgentMbedCloudClient::client_unregistered()
{
    _registered = false;

    printf("Client unregistered\n");
}

void EnebularAgentMbedCloudClient::client_error(int error_code)
{
    const char * err;

    switch(error_code) {
        case MbedCloudClient::ConnectErrorNone:
            err = "ConnectErrorNone";
            break;
        case MbedCloudClient::ConnectAlreadyExists:
            err = "ConnectAlreadyExists";
            break;
        case MbedCloudClient::ConnectBootstrapFailed:
            err = "ConnectBootstrapFailed";
            break;
        case MbedCloudClient::ConnectInvalidParameters:
            err = "ConnectInvalidParameters";
            break;
        case MbedCloudClient::ConnectNotRegistered:
            err = "ConnectNotRegistered";
            break;
        case MbedCloudClient::ConnectTimeout:
            err = "ConnectTimeout";
            break;
        case MbedCloudClient::ConnectNetworkError:
            err = "ConnectNetworkError";
            break;
        case MbedCloudClient::ConnectResponseParseFailed:
            err = "ConnectResponseParseFailed";
            break;
        case MbedCloudClient::ConnectUnknownError:
            err = "ConnectUnknownError";
            break;
        case MbedCloudClient::ConnectMemoryConnectFail:
            err = "ConnectMemoryConnectFail";
            break;
        case MbedCloudClient::ConnectNotAllowed:
            err = "ConnectNotAllowed";
            break;
        case MbedCloudClient::ConnectSecureConnectionFailed:
            err = "ConnectSecureConnectionFailed";
            break;
        case MbedCloudClient::ConnectDnsResolvingFailed:
            err = "ConnectDnsResolvingFailed";
            break;
#ifdef MBED_CLOUD_CLIENT_SUPPORT_UPDATE
        case MbedCloudClient::UpdateWarningCertificateNotFound:
            err = "UpdateWarningCertificateNotFound";
            break;
        case MbedCloudClient::UpdateWarningIdentityNotFound:
            err = "UpdateWarningIdentityNotFound";
            break;
        case MbedCloudClient::UpdateWarningCertificateInvalid:
            err = "UpdateWarningCertificateInvalid";
            break;
        case MbedCloudClient::UpdateWarningSignatureInvalid:
            err = "UpdateWarningSignatureInvalid";
            break;
        case MbedCloudClient::UpdateWarningVendorMismatch:
            err = "UpdateWarningVendorMismatch";
            break;
        case MbedCloudClient::UpdateWarningClassMismatch:
            err = "UpdateWarningClassMismatch";
            break;
        case MbedCloudClient::UpdateWarningDeviceMismatch:
            err = "UpdateWarningDeviceMismatch";
            break;
        case MbedCloudClient::UpdateWarningURINotFound:
            err = "UpdateWarningURINotFound";
            break;
        case MbedCloudClient::UpdateWarningRollbackProtection:
            err = "UpdateWarningRollbackProtection";
            break;
        case MbedCloudClient::UpdateWarningUnknown:
            err = "UpdateWarningUnknown";
            break;
        case MbedCloudClient::UpdateErrorWriteToStorage:
            err = "UpdateErrorWriteToStorage";
            break;
        case MbedCloudClient::UpdateErrorInvalidHash:
            err = "UpdateErrorInvalidHash";
            break;
#endif
        default:
            err = "UNKNOWN";
    }

    printf("Client error occurred: %s (%d)\n", err, error_code);
    printf("Error details: %s\n", _cloud_client.error_description());
}

M2MResource *EnebularAgentMbedCloudClient::add_resource(
        uint16_t object_id,
        uint16_t instance_id,
        uint16_t resource_id,
        const char *resource_type,
        M2MResourceInstance::ResourceType data_type,
        M2MBase::Operation operations,
        const char *value,
        bool observable,
        value_updated_callback value_updated_cb,
        execute_callback execute_cb)
{
    M2MObject *obj = NULL;
    M2MObjectInstance *obj_inst = NULL;
    M2MResource *resource = NULL;
    char name[8];

    /* find exiting object and instance or create a new one */
    M2MObjectList::const_iterator it;
    for (it = _object_list.begin(); it != _object_list.end(); it++) {
        if ((*it)->name_id() == object_id) {
            obj = (*it);
            break;
        }
    }
    if (!obj) {
        snprintf(name, sizeof(name), "%d", object_id);
        obj = M2MInterfaceFactory::create_object(name);
        _object_list.push_back(obj);
    } else {
        obj_inst = obj->object_instance(instance_id);
    }
    if (!obj_inst) {
        obj_inst = obj->create_object_instance(instance_id);
    }

    /* add and configure resource */
    snprintf(name, sizeof(name), "%d", resource_id);
    resource = obj_inst->create_dynamic_resource(name, resource_type, data_type, observable);
    if (value) {
        resource->set_value((const unsigned char*)value, strlen(value));
    }
    resource->set_operation(operations);
    if (operations & M2MResourceInstance::PUT_ALLOWED) {
        resource->set_value_updated_function(value_updated_cb);
    } else if (operations & M2MResourceInstance::POST_ALLOWED){
        resource->set_execute_function(execute_cb);
    }
    if (observable) {
#if 0
        // todo
        resource->set_notification_delivery_status_cb(
                    (void(*)(const M2MBase&,
                             const NoticationDeliveryStatus,
                             void*))notification_status_cb, NULL);
#endif
    }

    return resource;
}

M2MResource *EnebularAgentMbedCloudClient::add_execute_resource(
    uint16_t object_id,
    uint16_t instance_id,
    uint16_t resource_id,
    const char *resource_type,
    execute_callback execute_cb)
{
    return add_resource(
        object_id,
        instance_id,
        resource_id,
        resource_type,
        M2MResourceInstance::STRING,
        M2MBase::GET_POST_ALLOWED,
        NULL,
        false,
        NULL,
        execute_cb);
}

M2MResource *EnebularAgentMbedCloudClient::add_rw_resource(
    uint16_t object_id,
    uint16_t instance_id,
    uint16_t resource_id,
    const char *resource_type,
    M2MResourceInstance::ResourceType data_type,
    const char *value,
    bool observable,
    value_updated_callback value_updated_cb)
{
    return add_resource(
        object_id,
        instance_id,
        resource_id,
        resource_type,
        data_type,
        M2MBase::GET_PUT_ALLOWED,
        value,
        observable,
        value_updated_cb,
        NULL);
}
