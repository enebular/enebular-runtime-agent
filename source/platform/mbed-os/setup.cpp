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


#ifdef TARGET_LIKE_MBED

#include "mbed.h"
#include "setup.h"
#include "memory_tests.h"
#include "simplem2mclient.h"
#include "SDBlockDevice.h"
#include "FATFileSystem.h"
#include "application_init.h"
#include "pal.h"

#define DEFAULT_FIRMWARE_PATH       "/sd/firmware"

#define MBED_CONF_APP_ESP8266_TX MBED_CONF_APP_WIFI_TX
#define MBED_CONF_APP_ESP8266_RX MBED_CONF_APP_WIFI_RX

#include "easy-connect/easy-connect.h"
#include "mbed_trace.h"
#define TRACE_GROUP "exam"

// Some boards specific sanity checks, better stop early.
#if defined(TARGET_UBLOX_EVK_ODIN_W2) && defined(DEVICE_EMAC) && defined(MBED_CONF_APP_NETWORK_INTERFACE) && defined (ETHERNET) && (MBED_CONF_APP_NETWORK_INTERFACE == ETHERNET)
    #error "UBLOX_EVK_ODIN_W2 - does not work with Ethernet if you have EMAC on! Please fix your mbed_app.json."
#endif
#if defined(TARGET_UBLOX_EVK_ODIN_W2) && !defined(DEVICE_EMAC) && defined(MBED_CONF_APP_NETWORK_INTERFACE) && defined (WIFI_ODIN) && (MBED_CONF_APP_NETWORK_INTERFACE == WIFI_ODIN)
    #error "UBLOX_EVK_ODIN_W2 - does not work with WIFI_ODIN if you have disabled EMAC! Please fix your mbed_app.json."
#endif


#ifdef MBED_APPLICATION_SHIELD
#include "C12832.h"
C12832* lcd;
#endif


// Define led on/off
#ifdef TARGET_STM
#define LED_ON (true)
#else // #ifdef TARGET_STM
#define LED_ON (false)
#endif // #ifdef TARGET_STM

#define LED_OFF (!LED_ON)


DigitalOut  led(MBED_CONF_APP_LED_PINNAME, LED_OFF);
InterruptIn button(MBED_CONF_APP_BUTTON_PINNAME);

static bool clicked;

static void button_press(void);

void init_screen();

extern SDBlockDevice sd(MBED_CONF_SD_SPI_MOSI, MBED_CONF_SD_SPI_MISO, MBED_CONF_SD_SPI_CLK, MBED_CONF_SD_SPI_CS);

FATFileSystem fs("sd", &sd);

Thread resource_thread;
void *network_interface(NULL);

int initPlatform()
{
    int sd_ret;

    init_screen();
    sd_ret = sd.init();
    if(sd_ret != BD_ERROR_OK) {
        tr_error("initPlatform() - sd.init() failed with %d\n", sd_ret);
        return -1;
    }
    tr_debug("initPlatform() - SD card init OK.\n");

    if(MBED_CONF_APP_BUTTON_PINNAME != NC) {
        button.fall(&button_press);
    }

    return 0;
}

bool rmFirmwareImages()
{
    palStatus_t status = PAL_SUCCESS;
    status = pal_fsRmFiles(DEFAULT_FIRMWARE_PATH);
    if(status == PAL_SUCCESS) {
        printf("Firmware storage erased.\n");
    } else if (status == PAL_ERR_FS_NO_PATH) {
        printf("Firmware path not found/does not exist.\n");
    } else {
        printf("Firmware storage erasing failed with %d", status);
        return false;
    }
    return true;
}

int run_application(int(*function)(void))
{
    // application_init() runs the following initializations:
    //  1. trace initialization
    //  2. platform initialization
    //  3. print memory statistics if MBED_HEAP_STATS_ENABLED is defined
    //  4. FCC initialization.
    if (!application_init()) {
        printf("Initialization failed, exiting application!\n");
        return 1;
    }
    return function();
}

bool init_connection()
{
    srand(time(NULL));
    network_interface = easy_connect(true);
    if(network_interface == NULL) {
        return false;
    }
    return true;
}

void* get_network_interface()
{
    return network_interface;
}

void init_screen()
{
#ifdef MBED_APPLICATION_SHIELD
    /* Turn off red LED */
    DigitalOut ext_red(D5, 1);

    /* Turn on green LED */
    DigitalOut ext_green(D8, 0);

    lcd = new C12832(D11, D13, D12, D7, D10);
#endif
}

void print_to_screen(int x, int y, const char* buffer)
{
#ifdef MBED_APPLICATION_SHIELD
    lcd->locate(x, y);

    /* limit size to 25 characters */
    char output_buffer[26] = { 0 };

    size_t name_length = strnlen(buffer, 32);

    /* if buffer is 32 characters, assume FlakeID */
    if (name_length == 32)
    {
        /* < 64 bit timestamp >< 48 bit worker id>< 16 bit sequence number >
           Discard 7 characters form worker ID but keep the timestamp and
           sequence number
        */
        memcpy(&output_buffer[0], &buffer[0], 16);
        memcpy(&output_buffer[16], &buffer[23], 9);
    }
    else
    {
        /* fill output buffer with buffer */
        strncpy(output_buffer, buffer, 25);
    }

    lcd->printf("%s", output_buffer);
#endif
}

void clear_screen()
{
#ifdef MBED_APPLICATION_SHIELD
    lcd->cls();
#endif
}

void toggle_led(void)
{
    if (MBED_CONF_APP_LED_PINNAME != NC) {
        led = !led;
    }
    else {
        printf("Virtual LED toggled\n");
    }
}

void led_off(void)
{
    if (MBED_CONF_APP_LED_PINNAME != NC) {
        led = LED_OFF;
    }
    else {
        printf("Virtual LED off\n");
    }
}

uint8_t button_clicked(void)
{
    if (clicked) {
        clicked = 0;
        return 1;
    }
    return 0;
}

void button_press(void)
{
    clicked = true;
}

void print_heap_stats()
{
    heap_stats();
}

void print_m2mobject_stats()
{
    m2mobject_stats();
}

void create_m2mobject_test_set(M2MObjectList* object_list)
{
    m2mobject_test_set(*object_list);
}

void do_wait(int timeout_ms)
{
    wait_ms(timeout_ms);
}
#endif // TARGET_LIKE_MBED
