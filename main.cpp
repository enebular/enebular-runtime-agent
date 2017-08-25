//----------------------------------------------------------------------------
// The confidential and proprietary information contained in this file may
// only be used by a person authorised under and to the extent permitted
// by a subsisting licensing agreement from ARM Limited or its affiliates.
//
// (C) COPYRIGHT 2016 ARM Limited or its affiliates.
// ALL RIGHTS RESERVED
//
// This entire notice must be reproduced on all copies of this file
// and copies of this file may only be made by a person if such person is
// permitted to do so under the terms of a subsisting license agreement
// from ARM Limited or its affiliates.
//----------------------------------------------------------------------------

#include "simplem2mclient.h"
#include "application_init.h"

int app_start();

int main() {

    // application_init() runs the following initializations:
    //  1. trace initialization
    //  2. platform initialization
    //  3. print memory statistics if MBED_HEAP_STATS_ENABLED is defined
    //  4. FCC initialization.
    if (!application_init()) {
        printf("Initialization failed, exiting application!\n");
        return 1;
    }
    return app_start();

}
int app_start(){
    //Construct SimpleM2MClient from stack memory.
    SimpleM2MClient mbedClient;

    //Creates resources that are defined in m2mresources.h.
    mbedClient.create_resources();

    //Print to screen if available.
    clear_screen();
    print_to_screen(0, 3, "Cloud Client: Connecting");

    //Start registering to the cloud.
    mbedClient.call_register();

    //Start a thread that increments the value of _observable_resource.
    increment_resource_thread(&mbedClient);

    //Print memory statistics if the MBED_HEAP_STATS_ENABLED is defined.
    print_heap_stats();

    //Check if client is registering or registered, if true sleep and repeat.
    while (mbedClient.is_register_called()) {
        do_wait(1);
    }

    //Client unregistered, exit program.
    return 0;

}
