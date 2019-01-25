
#include <stdio.h>
#include <stdlib.h>
#include <time.h>
#include <pthread.h>
#include "factory_configurator_client.h"
#include "enebular_agent_mbed_cloud_connector.h"
#include "enebular_agent_mbed_cloud_client.h"

#define OBJECT_ID_DEPLOY_FLOW           (26242)
#define OBJECT_ID_REGISTER              (26243)
#define OBJECT_ID_AUTH_TOKEN            (26244)
#define OBJECT_ID_CONFIG                (26245)
#define OBJECT_ID_AGENT_INFO            (26246)
#define OBJECT_ID_DEVICE_STATE          (26247)

#define RESOURCE_ID_DOWNLOAD_URL            (26241)
#define RESOURCE_ID_CONNECTION_ID           (26241)
#define RESOURCE_ID_DEVICE_ID               (26242)
#define RESOURCE_ID_AUTH_REQUEST_URL        (26243)
#define RESOURCE_ID_AGENT_MANAGER_BASE_URL  (26244)
#define RESOURCE_ID_ACCEESS_TOKEN           (26241)
#define RESOURCE_ID_ID_TOKEN                (26242)
#define RESOURCE_ID_STATE                   (26243)
#define RESOURCE_ID_MONITOR_ENABLE          (26241)
#define RESOURCE_ID_AGENT_INFO              (26241)
#define RESOURCE_ID_DEVICE_STATE_CHANGE     (26241)

#define MAX_RESOURCE_SET_UPDATE_GAP (10)

#ifdef MBED_CLOUD_CLIENT_SUPPORT_UPDATE

/**
 * Note: update implementation is temp / blank
 */

void update_authorize(int32_t request)
{
    switch (request) {
        case MbedCloudClient::UpdateRequestDownload:
            printf("Firmware download requested\n");
            printf("Granting download authorization...\n");
            //client->get_cloud_client().update_authorize(MbedCloudClient::UpdateRequestDownload);
            break;
        case MbedCloudClient::UpdateRequestInstall:
            printf("Firmware install requested\n");
            printf("Granting install authorization...\n");
            //client->get_cloud_client().update_authorize(MbedCloudClient::UpdateRequestInstall);
            break;
        default:
            printf("Unknown update request (%d)\n", request);
            break;
    }
}

void update_progress(uint32_t progress, uint32_t total)
{
    uint8_t percent = (uint8_t)((uint64_t)progress * 100 / total);

    printf("Downloading: %d%%\n", percent);

    if (progress == total) {
        printf("\nDownload completed\n");
    }
}

#endif

void EnebularAgentMbedCloudClientCallback::value_updated(M2MBase *base, M2MBase::BaseType type) {
    Logger *logger = Logger::get_instance();
    logger->log_console(INFO, "Client: unexpected client callback: %s", base->uri_path());
}

EnebularAgentMbedCloudClient::EnebularAgentMbedCloudClient(EnebularAgentMbedCloudConnector * connector):
    _connector(connector),
    _clientCallback(new EnebularAgentMbedCloudClientCallback()),
    _logger(Logger::get_instance()),
    _connecting(false),
    _registered(false),
    _registered_state_updated(false)
{
    pthread_mutex_init(&_lock, NULL);
}

EnebularAgentMbedCloudClient::~EnebularAgentMbedCloudClient()
{
    if (_agent_info) {
        free(_agent_info);
    }
    delete _clientCallback;
    pthread_mutex_destroy(&_lock);
}

void EnebularAgentMbedCloudClient::setup_objects()
{
    _deploy_flow_download_url_res = add_rw_resource(
        OBJECT_ID_DEPLOY_FLOW, 0, RESOURCE_ID_DOWNLOAD_URL, "download_url",
        M2MResourceInstance::STRING, NULL, false,
        value_updated_callback(this, &EnebularAgentMbedCloudClient::deploy_flow_download_url_cb), 0);

    _register_connection_id_res = add_rw_resource(
        OBJECT_ID_REGISTER, 0, RESOURCE_ID_CONNECTION_ID, "connection_id",
        M2MResourceInstance::STRING, NULL, false,
        value_updated_callback(this, &EnebularAgentMbedCloudClient::register_connection_id_cb), 0);
    _register_device_id_res = add_rw_resource(
        OBJECT_ID_REGISTER, 0, RESOURCE_ID_DEVICE_ID, "device_id",
        M2MResourceInstance::STRING, NULL, false,
        value_updated_callback(this, &EnebularAgentMbedCloudClient::register_device_id_cb), 0);
    _register_auth_request_url_res = add_rw_resource(
        OBJECT_ID_REGISTER, 0, RESOURCE_ID_AUTH_REQUEST_URL, "auth_request_url",
        M2MResourceInstance::STRING, NULL, false,
        value_updated_callback(this, &EnebularAgentMbedCloudClient::register_auth_request_url_cb), 0);
    _register_agent_manager_base_url_res = add_rw_resource(
        OBJECT_ID_REGISTER, 0, RESOURCE_ID_AGENT_MANAGER_BASE_URL, "agent_manager_base_url",
        M2MResourceInstance::STRING, NULL, false,
        value_updated_callback(this, &EnebularAgentMbedCloudClient::register_agent_manager_base_url_cb), 0);

    _update_auth_access_token_res = add_rw_resource(
        OBJECT_ID_AUTH_TOKEN, 0, RESOURCE_ID_ACCEESS_TOKEN, "access_token",
        M2MResourceInstance::STRING, NULL, false,
        value_updated_callback(this, &EnebularAgentMbedCloudClient::update_auth_access_token_cb), 0);
    _update_auth_id_token_res = add_rw_resource(
        OBJECT_ID_AUTH_TOKEN, 0, RESOURCE_ID_ID_TOKEN, "id_token",
        M2MResourceInstance::STRING, NULL, false,
        value_updated_callback(this, &EnebularAgentMbedCloudClient::update_auth_id_token_cb), 0);
    _update_auth_state_res = add_rw_resource(
        OBJECT_ID_AUTH_TOKEN, 0, RESOURCE_ID_STATE, "state",
        M2MResourceInstance::STRING, NULL, false,
        value_updated_callback(this, &EnebularAgentMbedCloudClient::update_auth_state_cb), 0);

    _agent_info_res = add_rw_resource(
        OBJECT_ID_AGENT_INFO, 0, RESOURCE_ID_AGENT_INFO, "agent_info",
        M2MResourceInstance::STRING, NULL, true,
        value_updated_callback(this, &EnebularAgentMbedCloudClient::agent_info_cb), 30);

    _device_state_change_res = add_rw_resource(
        OBJECT_ID_DEVICE_STATE, 0, RESOURCE_ID_DEVICE_STATE_CHANGE, "device_state_change",
        M2MResourceInstance::STRING, NULL, false,
        value_updated_callback(this, &EnebularAgentMbedCloudClient::device_state_change_cb), 0);
}

void EnebularAgentMbedCloudClient::process_deploy_flow_update()
{
    char msg[1024*4];

    snprintf(msg, sizeof(msg)-1,
        "{"
            "\"downloadUrl\": \"%s\""
        "}",
        _deploy_flow_download_url_res->get_value_string().c_str());
    msg[sizeof(msg)-1] = '\0';

    queue_agent_man_msg("deploy", msg);
}

void EnebularAgentMbedCloudClient::process_register_update()
{
    char msg[1024*4];
    unsigned long long now;

    now = time(NULL);

    if (now - _register_connection_id_time > MAX_RESOURCE_SET_UPDATE_GAP ||
            now - _register_device_id_time > MAX_RESOURCE_SET_UPDATE_GAP ||
            now - _register_auth_request_url_time > MAX_RESOURCE_SET_UPDATE_GAP ||
            now - _register_agent_manager_base_url_time > MAX_RESOURCE_SET_UPDATE_GAP) {
        return;
    }

    snprintf(msg, sizeof(msg)-1,
        "{"
            "\"connectionId\": \"%s\","
            "\"deviceId\": \"%s\","
            "\"authRequestUrl\": \"%s\","
            "\"agentManagerBaseUrl\": \"%s\""
        "}",
        _register_connection_id_res->get_value_string().c_str(),
        _register_device_id_res->get_value_string().c_str(),
        _register_auth_request_url_res->get_value_string().c_str(),
        _register_agent_manager_base_url_res->get_value_string().c_str()
    );
    msg[sizeof(msg)-1] = '\0';

    queue_agent_man_msg("register", msg);

    _register_connection_id_time = 0;
    _register_device_id_time = 0;
    _register_auth_request_url_time = 0;
    _register_agent_manager_base_url_time = 0;
}

void EnebularAgentMbedCloudClient::process_update_auth_update()
{
    char msg[1024*4];
    unsigned long long now;

    now = time(NULL);

    if (now - _update_auth_access_token_time > MAX_RESOURCE_SET_UPDATE_GAP ||
            now - _update_auth_id_token_time > MAX_RESOURCE_SET_UPDATE_GAP ||
            now - _update_auth_state_time > MAX_RESOURCE_SET_UPDATE_GAP) {
        return;
    }

    snprintf(msg, sizeof(msg)-1,
        "{"
            "\"accessToken\": \"%s\","
            "\"idToken\": \"%s\","
            "\"state\": \"%s\""
        "}",
        _update_auth_access_token_res->get_value_string().c_str(),
        _update_auth_id_token_res->get_value_string().c_str(),
        _update_auth_state_res->get_value_string().c_str()
    );
    msg[sizeof(msg)-1] = '\0';

    queue_agent_man_msg("updateAuth", msg);

    _update_auth_access_token_time = 0;
    _update_auth_id_token_time = 0;
    _update_auth_state_time = 0;
}

void EnebularAgentMbedCloudClient::process_device_state_change()
{
    queue_agent_man_msg("deviceStateChange",
        _device_state_change_res->get_value_string().c_str());
}

/* Note: called from separate thread */
void EnebularAgentMbedCloudClient::deploy_flow_download_url_cb(const char *name)
{
    _logger->log_console(DEBUG, "Client: deploy_flow_download_url: %s",
        _deploy_flow_download_url_res->get_value_string().c_str());

    process_deploy_flow_update();
}

/* Note: called from separate thread */
void EnebularAgentMbedCloudClient::register_connection_id_cb(const char *name)
{
    _logger->log_console(DEBUG, "Client: register_connection_id: %s",
        _register_connection_id_res->get_value_string().c_str());

    _register_connection_id_time = time(NULL);
    process_register_update();
}

/* Note: called from separate thread */
void EnebularAgentMbedCloudClient::register_device_id_cb(const char *name)
{
    _logger->log_console(DEBUG, "Client: register_device_id: %s",
        _register_device_id_res->get_value_string().c_str());

    _register_device_id_time = time(NULL);
    process_register_update();
}

/* Note: called from separate thread */
void EnebularAgentMbedCloudClient::register_auth_request_url_cb(const char *name)
{
    _logger->log_console(DEBUG, "Client: register_auth_request_url: %s",
        _register_auth_request_url_res->get_value_string().c_str());

    _register_auth_request_url_time = time(NULL);
    process_register_update();
}

/* Note: called from separate thread */
void EnebularAgentMbedCloudClient::register_agent_manager_base_url_cb(const char *name)
{
    _logger->log_console(DEBUG, "Client: register_agent_manager_base_url: %s",
        _register_agent_manager_base_url_res->get_value_string().c_str());

    _register_agent_manager_base_url_time = time(NULL);
    process_register_update();
}

/* Note: called from separate thread */
void EnebularAgentMbedCloudClient::update_auth_access_token_cb(const char *name)
{
    _logger->log_console(DEBUG, "Client: update_auth_access_token: %s",
        _update_auth_access_token_res->get_value_string().c_str());

    _update_auth_access_token_time = time(NULL);
    process_update_auth_update();
}

/* Note: called from separate thread */
void EnebularAgentMbedCloudClient::update_auth_id_token_cb(const char *name)
{
    _logger->log_console(DEBUG, "Client: update_auth_id_token: %s",
        _update_auth_id_token_res->get_value_string().c_str());

    _update_auth_id_token_time = time(NULL);
    process_update_auth_update();
}

/* Note: called from separate thread */
void EnebularAgentMbedCloudClient::update_auth_state_cb(const char *name)
{
    _logger->log_console(DEBUG, "Client: update_auth_state: %s",
        _update_auth_state_res->get_value_string().c_str());

    _update_auth_state_time = time(NULL);
    process_update_auth_update();
}

/* Note: called from separate thread */
void EnebularAgentMbedCloudClient::agent_info_cb(const char *name)
{
    _logger->log_console(DEBUG, "Client: update_agent_info: %s",
        _agent_info_res->get_value_string().c_str());

    const char *val;

    pthread_mutex_lock(&_lock);
    val = (_agent_info) ? _agent_info : "-";
    pthread_mutex_unlock(&_lock);

    _agent_info_res->set_value((uint8_t *)val, strlen(val));
}

/* Note: called from separate thread */
void EnebularAgentMbedCloudClient::device_state_change_cb(const char *name)
{
    _logger->log_console(DEBUG, "Client: device_state_change: %s",
        _device_state_change_res->get_value_string().c_str());

    process_device_state_change();
}

bool EnebularAgentMbedCloudClient::init_fcc()
{
    fcc_status_e status;

    status = fcc_init();
    if (status != FCC_STATUS_SUCCESS) {
        _logger->log(ERROR, "Client: Failed to initialize FCC (%d)", status);
        return false;
    }

#if MBED_CONF_APP_DEVELOPER_MODE == 1
    _logger->log(INFO, "Client: Starting developer flow...");
    status = fcc_developer_flow();
    if (status == FCC_STATUS_KCM_FILE_EXIST_ERROR) {
        _logger->log(INFO, "Client: Developer credentials already exist");
    } else if (status != FCC_STATUS_SUCCESS) {
        _logger->log(INFO, "Client: Failed to load developer credentials");
        return false;
    }
#endif

    status = fcc_verify_device_configured_4mbed_cloud();
    if (status != FCC_STATUS_SUCCESS) {
        _logger->log(INFO, "Client: Not configured for mbed cloud");
        return false;
    } else {
        _logger->log(INFO, "Client: Configured for mbed cloud");
    }

    return true;
}

bool EnebularAgentMbedCloudClient::setup()
{
    if (!init_fcc()) {
        return false;
    }

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

    _cloud_client.set_update_callback(_clientCallback);

    return true;
}

void EnebularAgentMbedCloudClient::run()
{
    notify_agent_man_msgs();

    if (_registered_state_updated) {
        _registered_state_updated = false;
        notify_conntection_state();
    }
}

bool EnebularAgentMbedCloudClient::connect(void *iface)
{
    if (_connecting) {
        _logger->log(INFO, "Client: already connecting");
        return false;
    }
    if (_registered) {
        _logger->log(INFO, "Client: already connected");
        return false;
    }

    _connecting = true;

    return _cloud_client.setup(iface);
}

void EnebularAgentMbedCloudClient::disconnect()
{
    _connecting = false;

    _cloud_client.close();
}

bool EnebularAgentMbedCloudClient::is_connecting()
{
    return _connecting;
}

bool EnebularAgentMbedCloudClient::is_connected()
{
    return _registered;
}

void EnebularAgentMbedCloudClient::set_agent_info(const char *info)
{
    pthread_mutex_lock(&_lock);

    if (_agent_info) {
        free(_agent_info);
    }
    _agent_info = strdup(info);

    pthread_mutex_unlock(&_lock);
}

void EnebularAgentMbedCloudClient::on_connection_change(ClientConnectionStateCB cb)
{
    _connection_state_callbacks.push_back(cb);
}

void EnebularAgentMbedCloudClient::on_agent_manager_message(AgentManagerMessageCB cb)
{
    _agent_man_msg_callbacks.push_back(cb);
}

const char *EnebularAgentMbedCloudClient::get_device_id(void)
{
    const ConnectorClientEndpointInfo * info = _cloud_client.endpoint_info();
    if (info) {
        return info->internal_endpoint_name.c_str();
    }

    return NULL;
}

const char *EnebularAgentMbedCloudClient::get_endpoint_name(void)
{
    const ConnectorClientEndpointInfo * info = _cloud_client.endpoint_info();
    if (info) {
        return info->endpoint_name.c_str();
    }

    return NULL;
}

void EnebularAgentMbedCloudClient::notify_conntection_state()
{
    vector<ClientConnectionStateCB>::iterator it;
    for (it = _connection_state_callbacks.begin(); it != _connection_state_callbacks.end(); it++) {
        it->call();
    }
}

void EnebularAgentMbedCloudClient::notify_agent_man_msgs()
{
    while (!_agent_man_msgs.empty()) {

        pthread_mutex_lock(&_lock);
        agent_msg_t msg = _agent_man_msgs.front();
        _agent_man_msgs.pop();
        pthread_mutex_unlock(&_lock);

        vector<AgentManagerMessageCB>::iterator it;
        for (it = _agent_man_msg_callbacks.begin(); it != _agent_man_msg_callbacks.end(); it++) {
            it->call(msg.type.c_str(), msg.content.c_str());
        }

    }
}

void EnebularAgentMbedCloudClient::queue_agent_man_msg(const char *type, const char *content)
{
    agent_msg_t msg;
    msg.type = type;
    msg.content = content;

    pthread_mutex_lock(&_lock);
    _agent_man_msgs.push(msg);
    pthread_mutex_unlock(&_lock);

    _connector->kick();
}

void EnebularAgentMbedCloudClient::update_registered_state(bool registered)
{
    _connecting = false;

    _registered = registered;
    _registered_state_updated = true;

    _connector->kick();
}

/* Note: called from separate thread */
void EnebularAgentMbedCloudClient::client_registered()
{
    update_registered_state(true);
}

/* Note: called from separate thread */
void EnebularAgentMbedCloudClient::client_registration_updated()
{
    _logger->log_console(DEBUG, "Client: Client registration updated");
}

/* Note: called from separate thread */
void EnebularAgentMbedCloudClient::client_unregistered()
{
    update_registered_state(false);
}

/* Note: called from separate thread */
void EnebularAgentMbedCloudClient::client_error(int error_code)
{
    const char * err;

    switch (error_code) {
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

    _logger->log_console(INFO, "Client: Client error occurred: %s (%d)", err, error_code);
    _logger->log_console(INFO, "Client: Error details: %s", _cloud_client.error_description());
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
        execute_callback execute_cb,
        uint32_t max_age)
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
    if (max_age != 0) {
        resource->set_max_age(max_age);
    }
    resource->set_operation(operations);
    if (operations & M2MResourceInstance::PUT_ALLOWED) {
        resource->set_value_updated_function(value_updated_cb);
    } else if (operations & M2MResourceInstance::POST_ALLOWED){
        resource->set_execute_function(execute_cb);
    }
    if (observable) {
#if 0
        /**
         * Todo: implement this if/when we start using notifying resources
         */
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
    execute_callback execute_cb,
    uint32_t max_age)
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
        execute_cb,
        max_age);
}

M2MResource *EnebularAgentMbedCloudClient::add_rw_resource(
    uint16_t object_id,
    uint16_t instance_id,
    uint16_t resource_id,
    const char *resource_type,
    M2MResourceInstance::ResourceType data_type,
    const char *value,
    bool observable,
    value_updated_callback value_updated_cb,
    uint32_t max_age)
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
        NULL,
        max_age);
}
