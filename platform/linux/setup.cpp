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

#include <stdio.h>
#include <unistd.h>
#include <pthread.h>
#include <signal.h>
#include "setup.h"
#include "simplem2mclient.h"

// Internal function prototypes
void init_screen();
typedef void (*signalhandler_t)(int);
static void handle_signal(void);
void *network_interface = 0;
pthread_t resource_thread;

static void handle_signal(void)
{
    pthread_detach(resource_thread);
    exit(0);
}
int initPlatform() {
    init_screen();
    signal(SIGTERM, (signalhandler_t)handle_signal);
    return 0;
}

void* increment_resource(void* arg) {
    SimpleM2MClient *client;
    client = (SimpleM2MClient*) arg;
    while(true) {
        sleep(INCREMENT_INTERVAL/1000);
        if(client->is_client_registered()) {
            client->increment_resource_value();
#if defined(MBED_CLOUD_CLIENT_TRANSPORT_MODE_UDP) || \
    defined(MBED_CLOUD_CLIENT_TRANSPORT_MODE_UDP_QUEUE)
            client->keep_alive();
#endif
        }
    }
    return NULL;
}

bool init_connection() {
    //  PAL_NET_DEFAULT_INTERFACE 0xFFFFFFFF
    unsigned int network=0xFFFFFFFF;
    network_interface = &network;
    return true;
}

void* get_network_interface() {
    return network_interface;
}

void init_screen() {
}

void print_to_screen(int x, int y, const char* buffer) {
}

void clear_screen() {
}

void increment_resource_thread(void *client) {
    pthread_create(&resource_thread, NULL, &increment_resource, (void*)client);
}

void print_heap_stats() {
}

void print_m2mobject_stats() {
}

void create_m2mobject_test_set(M2MObjectList* /*object_list*/) {
}

void do_wait(int timeout_in_sec) {
    sleep(timeout_in_sec);
}
