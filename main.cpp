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
#include "enebular_mbed.h"

static int main_application(void);

int main()
{
    // run_application() will first initialize the program and then call main_application()
    return run_application(&main_application);
}

// Pointer to mbedClient, used for calling close function.
static SimpleM2MClient *client;

// This function is called when a POST request is received for resource 5000/0/1.
void unregister(void *)
{
    printf("Unregister resource executed\n");
    client->close();
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

    enebular_mbed_init(&mbedClient);

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

    enebular_agent_cleanup();

    // Client unregistered, exit program.
    return 0;
}
