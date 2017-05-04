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

#include "mbed-trace/mbed_trace.h"
#include "mbed-trace-helper.h"
#include "simplem2mclient.h"
#include "factory_configurator_client.h"

static bool init_mbed_trace()
{
    // Create mutex for tracing to avoid broken lines in logs
    if(!mbed_trace_helper_create_mutex()) {
        printf("ERROR -Mutex creation for mbed_trace failed!\n");
        return false;
    }

    // Initialize mbed trace
    mbed_trace_init();
    mbed_trace_mutex_wait_function_set(mbed_trace_helper_mutex_wait);
    mbed_trace_mutex_release_function_set(mbed_trace_helper_mutex_release);

    return true;
}

int main() {
    if (!init_mbed_trace()) {
        printf("Failed initializing mbed trace\n - exit" );
        mbed_trace_free();
        mbed_trace_helper_delete_mutex();
        return 1;
    }
    printf("Starting example client\n");
    if(initPlatform()!=0) {
       printf("ERROR - initPlatform() failed!\n");
       return -1;
    }
    clear_screen();
    print_to_screen(0, 3, "Cloud Client: Initializing");

#if defined (MESH) || (MBED_CONF_LWIP_IPV6_ENABLED==true)
    printf("IPv6 mode\n");
#else
    printf("IPv4 mode\n");
#endif

    // Print some statistics of the object sizes and heap memory consumption
    // if the MBED_HEAP_STATS_ENABLED is defined.
    print_m2mobject_stats();
    print_heap_stats();
    printf("Start simple mbed Cloud Client\n");

    fcc_status_e status =fcc_init();
    if(status != FCC_STATUS_SUCCESS) {
        printf("fcc_init failed with status %d! - exit\n", status);
        return 1;
    }

    // Resets storage to an empty state.
    // Use this function when you want to clear storage from all the factory-tool generated data and user data.
    // After this operation device must be injected again by using factory tool or developer certificate.
#ifdef RESET_STORAGE
    printf("Resets storage to an empty state\n");
    fcc_status_e delete_status = fcc_storage_delete();
    if (delete_status != FCC_STATUS_SUCCESS) {
        printf("Failed to delete storage - %d\n", delete_status);
    }
#endif

#ifdef MBED_CONF_APP_DEVELOPER_MODE
    printf("Start developer flow\n");
    status = fcc_developer_flow();
    if (status == FCC_STATUS_KCM_FILE_EXIST_ERROR) {
        printf("Developer credentials already exists\n");
    } else if (status != FCC_STATUS_SUCCESS) {
        printf("Failed to load developer credentials - exit\n");
        return 1;
    }    
#endif
    status = fcc_verify_device_configured_4mbed_cloud();
    if (status != FCC_STATUS_SUCCESS) {
        printf("Device not configured for mbed Cloud - exit\n");
        return 1;
    }
    
    SimpleM2MClient mbedClient;;
    mbedClient.create_resources();
    clear_screen();
    print_to_screen(0, 3, "Cloud Client: Connecting");
    increment_resource_thread(&mbedClient);
    mbedClient.call_register();
    print_heap_stats();
    while (mbedClient.is_register_called()) {do_wait(0);}
}
