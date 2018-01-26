
#include <time.h>
#include "simplem2mclient.h"
#include "enebular_agent.h"
#include "enebular_mbed.h"

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
static M2MResource* auth_token_access_token_res;
static M2MResource* auth_token_id_token_res;
static M2MResource* auth_token_state_res;

unsigned long long register_connection_id_time;
unsigned long long register_device_id_time;
unsigned long long register_auth_request_url_time;
unsigned long long register_agent_manager_base_url_time;
unsigned long long auth_token_access_token_time;
unsigned long long auth_token_id_token_time;
unsigned long long auth_token_state_time;

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

static void process_auth_token_update(void)
{
    char msg[1024*4];
    unsigned long long now;

    now = time(NULL);

    if (now - auth_token_access_token_time > MAX_RESOURCE_SET_UPDATE_GAP ||
            now - auth_token_id_token_time > MAX_RESOURCE_SET_UPDATE_GAP ||
            now - auth_token_state_time > MAX_RESOURCE_SET_UPDATE_GAP) {
        return;
    }

    snprintf(msg, sizeof(msg)-1,
        "{"
            "\"accessToken\": \"%s\","
            "\"idToken\": \"%s\","
            "\"state\": \"%s\""
        "}",
        auth_token_access_token_res->get_value_string().c_str(),
        auth_token_id_token_res->get_value_string().c_str(),
        auth_token_state_res->get_value_string().c_str()
    );
    msg[sizeof(msg)-1] = '\0';

    enebular_agent_send_msg("updateAuth", msg);

    auth_token_access_token_time = 0;
    auth_token_id_token_time = 0;
    auth_token_state_time = 0;
}

static void deploy_flow_download_url_updated(const char *val)
 {
    printf("deploy_flow:download_url: %s\n",
        deploy_flow_download_url_res->get_value_string().c_str());

    process_deploy_flow_update();
}

static void register_connection_id_updated(const char *val)
 {
    printf("register:connection_id: %s\n",
        register_connection_id_res->get_value_string().c_str());

    register_connection_id_time = time(NULL);
    process_register_update();
}

static void register_device_id_updated(const char *val)
 {
    printf("register:device_id: %s\n",
        register_device_id_res->get_value_string().c_str());

    register_device_id_time = time(NULL);
    process_register_update();
}

static void register_auth_request_url_updated(const char *val)
 {
    printf("register:auth_request_url: %s\n",
        register_auth_request_url_res->get_value_string().c_str());

    register_auth_request_url_time = time(NULL);
    process_register_update();
}

static void register_agent_manager_base_url_updated(const char *val)
 {
    printf("register:agent_manager_baseUrl: %s\n",
        register_agent_manager_base_url_res->get_value_string().c_str());

    register_agent_manager_base_url_time = time(NULL);
    process_register_update();
}

static void auth_token_access_token_updated(const char *val)
 {
    printf("auth_token:access_token: %s\n",
        auth_token_access_token_res->get_value_string().c_str());

    auth_token_access_token_time = time(NULL);
    process_auth_token_update();
}

static void auth_token_id_token_updated(const char *val)
 {
    printf("auth_token:id_token: %s\n",
        auth_token_id_token_res->get_value_string().c_str());

    auth_token_id_token_time = time(NULL);
    process_auth_token_update();
}

static void auth_token_state_updated(const char *val)
 {
    printf("auth_token:state: %s\n",
        auth_token_state_res->get_value_string().c_str());

    auth_token_state_time = time(NULL);
    process_auth_token_update();
}

void enebular_mbed_init(SimpleM2MClient * mbedClient)
{
    deploy_flow_download_url_res = mbedClient->add_cloud_resource(
        OBJECT_ID_DEPLOY_FLOW, 0, RESOURCE_ID_DOWNLOAD_URL, "download_url",
        M2MResourceInstance::STRING, M2MBase::GET_PUT_ALLOWED, NULL, false,
        (void*)deploy_flow_download_url_updated, NULL);

    register_connection_id_res = mbedClient->add_cloud_resource(
        OBJECT_ID_REGISTER, 0, RESOURCE_ID_CONNECTION_ID, "connection_id",
        M2MResourceInstance::STRING, M2MBase::GET_PUT_ALLOWED, NULL, false,
        (void*)register_connection_id_updated, NULL);
    register_device_id_res = mbedClient->add_cloud_resource(
        OBJECT_ID_REGISTER, 0, RESOURCE_ID_DEVICE_ID, "device_id",
        M2MResourceInstance::STRING, M2MBase::GET_PUT_ALLOWED, NULL, false,
        (void*)register_device_id_updated, NULL);
    register_auth_request_url_res = mbedClient->add_cloud_resource(
        OBJECT_ID_REGISTER, 0, RESOURCE_ID_AUTH_REQUEST_URL, "auth_request_url",
        M2MResourceInstance::STRING, M2MBase::GET_PUT_ALLOWED, NULL, false,
        (void*)register_auth_request_url_updated, NULL);
    register_agent_manager_base_url_res = mbedClient->add_cloud_resource(
        OBJECT_ID_REGISTER, 0, RESOURCE_ID_AGENT_MANAGER_BASE_URL, "agent_manager_base_url",
        M2MResourceInstance::STRING, M2MBase::GET_PUT_ALLOWED, NULL, false,
        (void*)register_agent_manager_base_url_updated, NULL);

    auth_token_access_token_res = mbedClient->add_cloud_resource(
        OBJECT_ID_AUTH_TOKEN, 0, RESOURCE_ID_ACCEESS_TOKEN, "access_token",
        M2MResourceInstance::STRING, M2MBase::GET_PUT_ALLOWED, NULL, false,
        (void*)auth_token_access_token_updated, NULL);
    auth_token_id_token_res = mbedClient->add_cloud_resource(
        OBJECT_ID_AUTH_TOKEN, 0, RESOURCE_ID_ID_TOKEN, "id_token",
        M2MResourceInstance::STRING, M2MBase::GET_PUT_ALLOWED, NULL, false,
        (void*)auth_token_id_token_updated, NULL);
    auth_token_state_res = mbedClient->add_cloud_resource(
        OBJECT_ID_AUTH_TOKEN, 0, RESOURCE_ID_STATE, "state",
        M2MResourceInstance::STRING, M2MBase::GET_PUT_ALLOWED, NULL, false,
        (void*)auth_token_state_updated, NULL);
}
