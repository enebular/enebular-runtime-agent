// ----------------------------------------------------------------------------
// Copyright 2016-2017 ARM Ltd.
//
// SPDX-License-Identifier: Apache-2.0
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
// ----------------------------------------------------------------------------

#include "simplem2mclient.h"
#include "enebular_agent.h"
#include <time.h>

static int main_application(void);

int main()
{
    // run_application() will first initialize the program and then call main_application()
    return run_application(&main_application);
}

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

// Pointers to the resources that will be created in main_application().
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

// Pointer to mbedClient, used for calling close function.
static SimpleM2MClient *client;

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

void unregister(void *)
{
    printf("Unregister resource executed\n");
    client->close();
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

int main_application(void)
{
    // SimpleClient is used for registering and unregistering resources to a server.
    SimpleM2MClient mbedClient;

    // Save pointer to mbedClient so that other functions can access it.
    client = &mbedClient;

    // Create resource for unregistering the device. Path of this resource will be: 5000/0/1.
    mbedClient.add_cloud_resource(5000, 0, 1, "unregister", M2MResourceInstance::STRING,
                M2MBase::POST_ALLOWED, NULL, false, (void*)unregister, NULL);

    deploy_flow_download_url_res = mbedClient.add_cloud_resource(
        OBJECT_ID_DEPLOY_FLOW, 0, RESOURCE_ID_DOWNLOAD_URL, "download_url",
        M2MResourceInstance::STRING, M2MBase::GET_PUT_ALLOWED, NULL, false,
        (void*)deploy_flow_download_url_updated, NULL);

    register_connection_id_res = mbedClient.add_cloud_resource(
        OBJECT_ID_REGISTER, 0, RESOURCE_ID_CONNECTION_ID, "connection_id",
        M2MResourceInstance::STRING, M2MBase::GET_PUT_ALLOWED, NULL, false,
        (void*)register_connection_id_updated, NULL);
    register_device_id_res = mbedClient.add_cloud_resource(
        OBJECT_ID_REGISTER, 0, RESOURCE_ID_DEVICE_ID, "device_id",
        M2MResourceInstance::STRING, M2MBase::GET_PUT_ALLOWED, NULL, false,
        (void*)register_device_id_updated, NULL);
    register_auth_request_url_res = mbedClient.add_cloud_resource(
        OBJECT_ID_REGISTER, 0, RESOURCE_ID_AUTH_REQUEST_URL, "auth_request_url",
        M2MResourceInstance::STRING, M2MBase::GET_PUT_ALLOWED, NULL, false,
        (void*)register_auth_request_url_updated, NULL);
    register_agent_manager_base_url_res = mbedClient.add_cloud_resource(
        OBJECT_ID_REGISTER, 0, RESOURCE_ID_AGENT_MANAGER_BASE_URL, "agent_manager_base_url",
        M2MResourceInstance::STRING, M2MBase::GET_PUT_ALLOWED, NULL, false,
        (void*)register_agent_manager_base_url_updated, NULL);

    auth_token_access_token_res = mbedClient.add_cloud_resource(
        OBJECT_ID_AUTH_TOKEN, 0, RESOURCE_ID_ACCEESS_TOKEN, "access_token",
        M2MResourceInstance::STRING, M2MBase::GET_PUT_ALLOWED, NULL, false,
        (void*)auth_token_access_token_updated, NULL);
    auth_token_id_token_res = mbedClient.add_cloud_resource(
        OBJECT_ID_AUTH_TOKEN, 0, RESOURCE_ID_ID_TOKEN, "id_token",
        M2MResourceInstance::STRING, M2MBase::GET_PUT_ALLOWED, NULL, false,
        (void*)auth_token_id_token_updated, NULL);
    auth_token_state_res = mbedClient.add_cloud_resource(
        OBJECT_ID_AUTH_TOKEN, 0, RESOURCE_ID_STATE, "state",
        M2MResourceInstance::STRING, M2MBase::GET_PUT_ALLOWED, NULL, false,
        (void*)auth_token_state_updated, NULL);

    // Print to screen if available.
    clear_screen();
    print_to_screen(0, 3, "Cloud Client: Connecting");

    enebular_agent_init();

    mbedClient.register_and_connect();

    bool reported_connected = false;
    // Check if client is registering or registered, if true sleep and repeat.
    while (mbedClient.is_register_called()) {
        if (reported_connected != mbedClient.is_client_registered()) {
            reported_connected = mbedClient.is_client_registered();
            enebular_agent_notify_conn_state(reported_connected);
        }
        do_wait(100);
    }

    enebular_agent_notify_conn_state(false);

    // Client unregistered, exit program.
    return 0;
}
