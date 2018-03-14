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


#ifdef FREERTOS

///////////
// INCLUDES
///////////
#include <stdio.h>
#include <unistd.h>
#include "setup.h"
#include "ethernetif.h"
#include "simplem2mclient.h"
#include "application_init.h"

#include "FreeRTOS.h"
#include "task.h"

////////////////////////////////////////
// PLATFORM SPECIFIC DEFINES & FUNCTIONS
////////////////////////////////////////
extern "C" {
    extern volatile bool dhcp_done;
}

void *network_interface = 0;

extern int initFreeRTOSPlatform();
extern void* GetNetWorkInterfaceContext();

int(*main_function)(void) = NULL;

void main_task(void)
{
    // wait until DHCP request is completed
    while(dhcp_done == 0) {
        do_wait(100);
    }

    // application_init() runs the following initializations:
    //  1. trace initialization
    //  2. platform initialization
    //  3. print memory statistics if MBED_HEAP_STATS_ENABLED is defined
    //  4. FCC initialization.
    if (!application_init()) {
        printf("Initialization failed, exiting application!\n");
        vTaskDelete( NULL );
    }
    // Initialization done, run the program.

    main_function();

    vTaskDelete( NULL );
}

/////////////////////////
// SETUP.H IMPLEMENTATION
/////////////////////////
int initPlatform()
{
    return 0;
}

int reformat_storage()
{
    return 0;
}

bool rmFirmwareImages()
{
    printf("rmFirmwareImages is not supported on freeRTOS!\n");
    return false;
}

int run_application(int(*function)(void))
{
    main_function = function;

    initFreeRTOSPlatform();

    runProgram(&main_task);

    return 0;
}

bool init_connection()
{
    network_interface = GetNetWorkInterfaceContext();
    return true;
}

void* get_network_interface()
{
    return network_interface;
}

void toggle_led(void)
{
    printf("Virtual LED toggled\n");
}

uint8_t button_clicked(void)
{
    static uint8_t count = 0;
    if (count++ == 200) {
        count = 0;
        printf("Virtual button clicked\n");
        return 1;
    }

    return 0;
}

void do_wait(int timeout_ms)
{
    vTaskDelay(timeout_ms);
}

void led_off(void) {}
void init_screen() {}
void print_to_screen(int x, int y, const char* buffer) {}
void clear_screen() {}
void print_heap_stats() {}
void print_m2mobject_stats() {}
void create_m2mobject_test_set(M2MObjectList* /*object_list*/) {}

#endif // FREERTOS

