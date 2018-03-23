
#include <stdio.h>
#include <unistd.h>
#include <errno.h>
#include <sys/stat.h>
#include <signal.h>
#include "mbed-trace/mbed_trace.h"
#include "mbed-trace-helper.h"
#include "enebular_agent_mbed_cloud_connector.h"

/**
 * Comments from the example:
 * This has to be "./pal" for now as this is the default which is picked by
 * ESFS. If you want to pass another folder name , you need to do it through
 * ESFS API otherwise mounting of folder will fail.
 */
#define DEFAULT_STORAGE_PATH "./pal"

/**
 * PAL_NET_DEFAULT_INTERFACE == 0xFFFFFFFF
 */
static unsigned int _network_interface = 0xFFFFFFFF;
static void *network_interface = &_network_interface;
static bool run;

/**
 * Todo: confirm the details of this.
 */
static bool init_mbed_trace(void)
{
    if (!mbed_trace_helper_create_mutex()) {
        return false;
    }

    mbed_trace_init();
    mbed_trace_mutex_wait_function_set(mbed_trace_helper_mutex_wait);
    mbed_trace_mutex_release_function_set(mbed_trace_helper_mutex_release);

    return true;
}

static bool init_storage_dir(void)
{
    int ret = mkdir(DEFAULT_STORAGE_PATH, 0744);
    if (ret < 0) {
        if (errno != EEXIST) {
            return false;
        }
    }

    return true;
}

static void sigaction_handler(int sig)
{
    run = false;
}

static bool init_signals(void)
{
    struct sigaction sigact;
    int ret;

    sigact.sa_flags = 0;
    sigemptyset(&sigact.sa_mask);
    sigact.sa_handler = sigaction_handler;

    ret = sigaction(SIGINT, &sigact, NULL);
    if (ret < 0) {
        return false;
    }

    ret = sigaction(SIGTERM, &sigact, NULL);
    if (ret < 0) {
        return false;
    }

    return true;
}

static bool init(void)
{
    if (!init_mbed_trace()) {
        printf("Failed to initialize mbed trace\n");
        return false;
    }

    if (!init_storage_dir()) {
        printf("Failed to initialize storage directory\n");
        return false;
    }

    if (!init_signals()) {
        return false;
    }

    return true;
}

int main(int argc, char **argv)
{
    run = true;

    if (!init()) {
        printf("Base initialization failed\n");
        return EXIT_FAILURE;
    }

    EnebularAgentMbedCloudConnector connector;
    if (!connector.startup(network_interface)) {
        printf("Connector startup failed\n");
        return EXIT_FAILURE;
    }

    while (run) {
        usleep(100 * 1000);
    }

    connector.shutdown();

    return EXIT_SUCCESS;
}

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
