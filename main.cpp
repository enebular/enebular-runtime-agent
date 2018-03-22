
#include <stdio.h>
#include <unistd.h>
#include <errno.h>
#include <sys/stat.h>
#include "factory_configurator_client.h"
#include "mbed-trace/mbed_trace.h"
#include "mbed-trace-helper.h"
#include "enebular_agent_mbed_cloud_client.h"
#include "enebular_agent.h"

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

static EnebularAgentMbedCloudClient *mbed_cloud_client;
static bool reported_connected;

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

static bool init_fcc(void)
{
    fcc_status_e status;

    status = fcc_init();
    if (status != FCC_STATUS_SUCCESS) {
        printf("Failed to initialize FCC (%d)\n", status);
        return false;
    }

#if MBED_CONF_APP_DEVELOPER_MODE == 1
    printf("Starting developer flow...\n");
    status = fcc_developer_flow();
    if (status == FCC_STATUS_KCM_FILE_EXIST_ERROR) {
        printf("Developer credentials already exist\n");
    } else if (status != FCC_STATUS_SUCCESS) {
        printf("Failed to load developer credentials\n");
        return false;
    }
#endif

    status = fcc_verify_device_configured_4mbed_cloud();
    if (status != FCC_STATUS_SUCCESS) {
        printf("Not configured for mbed cloud\n");
        return false;
    } else {
        printf("Configured for mbed cloud\n");
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

    if (!init_fcc()) {
        printf("Failed to initialize FCC\n");
        return false;
    }

    return true;
}

#if 0
// This function is called when a POST request is received for resource 5000/0/1.
static void unregister(void *)
{
    printf("Unregister resource executed\n");
    client->close();
}

    // Create resource for unregistering the device. Path of this resource will be: 5000/0/1.
    mbedClient.add_cloud_resource(5000, 0, 1, "unregister", M2MResourceInstance::STRING,
                 M2MBase::POST_ALLOWED, NULL, false, (void*)unregister, NULL);
#endif

static void tick(void) {
    bool is_connected = mbed_cloud_client->is_connected();
    if (is_connected != reported_connected) {
        reported_connected = is_connected;
        enebular_agent_notify_conn_state(is_connected);
    }
}

int main(int argc, char **argv)
{
    if (!init()) {
        printf("Base initialization failed\n");
        return EXIT_FAILURE;
    }

    int ret = enebular_agent_init();
    if (ret < 0) {
        printf("Agent initialization failed\n");
        return EXIT_FAILURE;
    }

    mbed_cloud_client = new EnebularAgentMbedCloudClient();
    mbed_cloud_client->setup();
    mbed_cloud_client->connect(network_interface);

    // todo: clean shutdown on sig

    while (1) {
        tick();
        usleep(100 * 1000);
    }

    enebular_agent_notify_conn_state(false);
    enebular_agent_cleanup();

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
