
#include <time.h>
#include "enebular_agent.h"
#include "enebular_mbed.h"

#define MODULE_NAME "enebular-mbed"
//#define DEBUG
#ifdef DEBUG
#  define debug(format, ...) printf(MODULE_NAME ": debug: " format, ##__VA_ARGS__)
#else
#  define debug(format, ...)
#endif

#define MAX_RESOURCE_SET_UPDATE_GAP (10)

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

static M2MResource* deploy_flow_download_url_res;
static M2MResource* register_connection_id_res;
static M2MResource* register_device_id_res;
static M2MResource* register_auth_request_url_res;
static M2MResource* register_agent_manager_base_url_res;
static M2MResource* update_auth_access_token_res;
static M2MResource* update_auth_id_token_res;
static M2MResource* update_auth_state_res;

unsigned long long register_connection_id_time;
unsigned long long register_device_id_time;
unsigned long long register_auth_request_url_time;
unsigned long long register_agent_manager_base_url_time;
unsigned long long update_auth_access_token_time;
unsigned long long update_auth_id_token_time;
unsigned long long update_auth_state_time;

static void process_deploy_flow_update(void)
{
    char msg[1024*4];

    snprintf(msg, sizeof(msg)-1,
        "{"
            "\"downloadUrl\": \"%s\""
        "}",
        deploy_flow_download_url_res->get_value_string().c_str());
    msg[sizeof(msg)-1] = '\0';

    enebular_agent_send_msg("deploy", msg);
}

static void process_register_update(void)
{
    char msg[1024*4];
    unsigned long long now;

    now = time(NULL);

    if (now - register_connection_id_time > MAX_RESOURCE_SET_UPDATE_GAP ||
            now - register_device_id_time > MAX_RESOURCE_SET_UPDATE_GAP ||
            now - register_auth_request_url_time > MAX_RESOURCE_SET_UPDATE_GAP ||
            now - register_agent_manager_base_url_time > MAX_RESOURCE_SET_UPDATE_GAP) {
        return;
    }

    snprintf(msg, sizeof(msg)-1,
        "{"
            "\"connectionId\": \"%s\","
            "\"deviceId\": \"%s\","
            "\"authRequestUrl\": \"%s\","
            "\"agentManagerBaseUrl\": \"%s\""
        "}",
        register_connection_id_res->get_value_string().c_str(),
        register_device_id_res->get_value_string().c_str(),
        register_auth_request_url_res->get_value_string().c_str(),
        register_agent_manager_base_url_res->get_value_string().c_str()
    );
    msg[sizeof(msg)-1] = '\0';

    enebular_agent_send_msg("register", msg);

    register_connection_id_time = 0;
    register_device_id_time = 0;
    register_auth_request_url_time = 0;
    register_agent_manager_base_url_time = 0;
}

static void process_update_auth_update(void)
{
    char msg[1024*4];
    unsigned long long now;

    now = time(NULL);

    if (now - update_auth_access_token_time > MAX_RESOURCE_SET_UPDATE_GAP ||
            now - update_auth_id_token_time > MAX_RESOURCE_SET_UPDATE_GAP ||
            now - update_auth_state_time > MAX_RESOURCE_SET_UPDATE_GAP) {
        return;
    }

    snprintf(msg, sizeof(msg)-1,
        "{"
            "\"accessToken\": \"%s\","
            "\"idToken\": \"%s\","
            "\"state\": \"%s\""
        "}",
        update_auth_access_token_res->get_value_string().c_str(),
        update_auth_id_token_res->get_value_string().c_str(),
        update_auth_state_res->get_value_string().c_str()
    );
    msg[sizeof(msg)-1] = '\0';

    enebular_agent_send_msg("updateAuth", msg);

    update_auth_access_token_time = 0;
    update_auth_id_token_time = 0;
    update_auth_state_time = 0;
}

static void deploy_flow_download_url_updated(const char *val)
 {
    debug("deploy_flow:download_url: %s\n",
        deploy_flow_download_url_res->get_value_string().c_str());

    process_deploy_flow_update();
}

static void register_connection_id_updated(const char *val)
 {
    debug("register:connection_id: %s\n",
        register_connection_id_res->get_value_string().c_str());

    register_connection_id_time = time(NULL);
    process_register_update();
}

static void register_device_id_updated(const char *val)
 {
    debug("register:device_id: %s\n",
        register_device_id_res->get_value_string().c_str());

    register_device_id_time = time(NULL);
    process_register_update();
}

static void register_auth_request_url_updated(const char *val)
 {
    debug("register:auth_request_url: %s\n",
        register_auth_request_url_res->get_value_string().c_str());

    register_auth_request_url_time = time(NULL);
    process_register_update();
}

static void register_agent_manager_base_url_updated(const char *val)
 {
    debug("register:agent_manager_baseUrl: %s\n",
        register_agent_manager_base_url_res->get_value_string().c_str());

    register_agent_manager_base_url_time = time(NULL);
    process_register_update();
}

static void update_auth_access_token_updated(const char *val)
 {
    debug("update_auth:access_token: %s\n",
        update_auth_access_token_res->get_value_string().c_str());

    update_auth_access_token_time = time(NULL);
    process_update_auth_update();
}

static void update_auth_id_token_updated(const char *val)
 {
    debug("update_auth:id_token: %s\n",
        update_auth_id_token_res->get_value_string().c_str());

    update_auth_id_token_time = time(NULL);
    process_update_auth_update();
}

static void update_auth_state_updated(const char *val)
 {
    debug("update_auth:state: %s\n",
        update_auth_state_res->get_value_string().c_str());

    update_auth_state_time = time(NULL);
    process_update_auth_update();
}

static void add_resources(SimpleM2MClient * mbed_client)
{
    deploy_flow_download_url_res = mbed_client->add_cloud_resource(
        OBJECT_ID_DEPLOY_FLOW, 0, RESOURCE_ID_DOWNLOAD_URL, "download_url",
        M2MResourceInstance::STRING, M2MBase::GET_PUT_ALLOWED, NULL, false,
        (void*)deploy_flow_download_url_updated, NULL);

    register_connection_id_res = mbed_client->add_cloud_resource(
        OBJECT_ID_REGISTER, 0, RESOURCE_ID_CONNECTION_ID, "connection_id",
        M2MResourceInstance::STRING, M2MBase::GET_PUT_ALLOWED, NULL, false,
        (void*)register_connection_id_updated, NULL);
    register_device_id_res = mbed_client->add_cloud_resource(
        OBJECT_ID_REGISTER, 0, RESOURCE_ID_DEVICE_ID, "device_id",
        M2MResourceInstance::STRING, M2MBase::GET_PUT_ALLOWED, NULL, false,
        (void*)register_device_id_updated, NULL);
    register_auth_request_url_res = mbed_client->add_cloud_resource(
        OBJECT_ID_REGISTER, 0, RESOURCE_ID_AUTH_REQUEST_URL, "auth_request_url",
        M2MResourceInstance::STRING, M2MBase::GET_PUT_ALLOWED, NULL, false,
        (void*)register_auth_request_url_updated, NULL);
    register_agent_manager_base_url_res = mbed_client->add_cloud_resource(
        OBJECT_ID_REGISTER, 0, RESOURCE_ID_AGENT_MANAGER_BASE_URL, "agent_manager_base_url",
        M2MResourceInstance::STRING, M2MBase::GET_PUT_ALLOWED, NULL, false,
        (void*)register_agent_manager_base_url_updated, NULL);

    update_auth_access_token_res = mbed_client->add_cloud_resource(
        OBJECT_ID_AUTH_TOKEN, 0, RESOURCE_ID_ACCEESS_TOKEN, "access_token",
        M2MResourceInstance::STRING, M2MBase::GET_PUT_ALLOWED, NULL, false,
        (void*)update_auth_access_token_updated, NULL);
    update_auth_id_token_res = mbed_client->add_cloud_resource(
        OBJECT_ID_AUTH_TOKEN, 0, RESOURCE_ID_ID_TOKEN, "id_token",
        M2MResourceInstance::STRING, M2MBase::GET_PUT_ALLOWED, NULL, false,
        (void*)update_auth_id_token_updated, NULL);
    update_auth_state_res = mbed_client->add_cloud_resource(
        OBJECT_ID_AUTH_TOKEN, 0, RESOURCE_ID_STATE, "state",
        M2MResourceInstance::STRING, M2MBase::GET_PUT_ALLOWED, NULL, false,
        (void*)update_auth_state_updated, NULL);
}

bool EnebularMbed::init(void) {
    int ret = enebular_agent_init();
    if (ret < 0) {
        return false;
    }
    add_resources(_mbed_client);
    return true;
}

void EnebularMbed::deinit(void) {
    enebular_agent_notify_conn_state(false);
    enebular_agent_cleanup();
}

void EnebularMbed::tick(void) {
    if (_reported_connected != _mbed_client->is_client_registered()) {
        _reported_connected = _mbed_client->is_client_registered();
        enebular_agent_notify_conn_state(_reported_connected);
    }
}
