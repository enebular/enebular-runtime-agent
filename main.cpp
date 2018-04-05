
#include <stdio.h>
#include <unistd.h>
#include <errno.h>
#include <sys/stat.h>
#include <signal.h>
#include <getopt.h>
#include "mbed-trace/mbed_trace.h"
#include "mbed-trace-helper.h"
#include "enebular_agent_mbed_cloud_connector.h"

#define PROGRAM_NAME "enebular-agent-mbed-cloud-connector"

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
static bool enable_log_console;
static bool enable_debug_logging;

EnebularAgentMbedCloudConnector *connector;

static bool init_mbed_trace(void)
{
#if MBED_CONF_MBED_TRACE_ENABLE
    if (!mbed_trace_helper_create_mutex()) {
        return false;
    }

    mbed_trace_init();
    mbed_trace_mutex_wait_function_set(mbed_trace_helper_mutex_wait);
    mbed_trace_mutex_release_function_set(mbed_trace_helper_mutex_release);
#endif
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

static void sigaction_handler_halt(int sig)
{
    if (!connector) {
        return;
    }

    connector->halt();
}

static void sigaction_handler_pipe(int sig)
{
    if (!connector) {
        return;
    }

    fprintf(stderr, "Terminating due to SIGPIPE...\n");

    exit(1);
}

static bool init_signals(void)
{
    struct sigaction sigact;
    int ret;

    sigact.sa_flags = 0;
    sigemptyset(&sigact.sa_mask);
    sigact.sa_handler = sigaction_handler_halt;

    ret = sigaction(SIGINT, &sigact, NULL);
    if (ret < 0) {
        return false;
    }

    ret = sigaction(SIGTERM, &sigact, NULL);
    if (ret < 0) {
        return false;
    }

    sigact.sa_handler = sigaction_handler_pipe;

    ret = sigaction(SIGPIPE, &sigact, NULL);
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

static void print_usage(void)
{
    printf(
        "\n"
        "Usage: " PROGRAM_NAME " [options]\n"
        "\n"
        "Options:\n"
        "    -h --help          Show this help\n"
        "    -c --console       Enable logging to the console\n"
        "    -d --debug         Enable debug logging\n"
        "\n"
    );
}

/* returns -1 if program should continue executing, exit val otherwise */
static int parse_args(int argc, char * const *argv)
{
    struct option options[] = {
        {"help",            0, NULL, 'h'},
        {"console",         0, NULL, 'c'},
        {"debug",           0, NULL, 'd'},
        {0, 0, 0, 0}
    };
    int c;

    while (1) {

        c = getopt_long(argc, argv, "hcd", options, NULL);
        if (c == -1)
            break;

        switch (c) {

            case 'h':
                print_usage();
                return 0;

            case 'c':
                enable_log_console = true;
                break;

            case 'd':
                enable_debug_logging = true;
                break;

            default:
                return 1;

        }

    }

    if (optind < argc) {
        fprintf(stderr, "%s: invalid arguments: ", basename(argv[0]));
        while (optind < argc) {
            fprintf(stderr, "%s ", argv[optind++]);
        }
        fprintf(stderr, "\n");
        return 1;
    }

    return -1;
}

int main(int argc, char **argv)
{
    int ret = parse_args(argc, argv);
    if (ret != -1) {
        exit(ret);
    }

    if (!init()) {
        printf("Base initialization failed\n");
        return EXIT_FAILURE;
    }

    connector = new EnebularAgentMbedCloudConnector();
    connector->enable_log_console(enable_log_console);
    if (enable_debug_logging) {
        connector->set_log_level(DEBUG);
    }

    if (!connector->startup(network_interface)) {
        printf("Connector startup failed\n");
        return EXIT_FAILURE;
    }

    connector->run();

    connector->shutdown();

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
