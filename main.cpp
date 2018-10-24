
#include <stdio.h>
#include <unistd.h>
#include <errno.h>
#include <sys/stat.h>
#include <signal.h>
#include <getopt.h>
#include "mbed-trace/mbed_trace.h"
#include "mbed-trace-helper.h"
#include "enebular_agent_mbed_cloud_connector.h"

#define PROGRAM_NAME    "enebular-agent-mbed-cloud-connector"
#define PROGRAM_VERSION "1.1.0"

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
        fprintf(stderr, "Failed to initialize mbed trace\n");
        return false;
    }

    if (!init_storage_dir()) {
        fprintf(stderr, "Failed to initialize storage directory\n");
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
        "    -v --version       Show version information\n"
        "    -c --console       Enable logging to the console\n"
        "    -d --debug         Enable debug logging\n"
        "\n"
    );
}

static void print_version(void)
{
    printf(PROGRAM_NAME ", v" PROGRAM_VERSION "\n");
}

/* returns -1 if program should continue executing, exit val otherwise */
static int parse_args(int argc, char * const *argv)
{
    struct option options[] = {
        {"help",            0, NULL, 'h'},
        {"version",         0, NULL, 'v'},
        {"console",         0, NULL, 'c'},
        {"debug",           0, NULL, 'd'},
        {0, 0, 0, 0}
    };
    int c;

    while (1) {

        c = getopt_long(argc, argv, "hvcd", options, NULL);
        if (c == -1)
            break;

        switch (c) {

            case 'h':
                print_usage();
                return 0;

            case 'v':
                print_version();
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
        fprintf(stderr, "Base initialization failed\n");
        return EXIT_FAILURE;
    }

    try {
        connector = new EnebularAgentMbedCloudConnector();
    } catch (...) {
        fprintf(stderr, "An unexpected runtime error occured\n");
        return EXIT_FAILURE;
    }

    connector->enable_log_console(enable_log_console);
    if (enable_debug_logging) {
        connector->set_log_level(DEBUG);
    }

    if (!connector->startup(network_interface)) {
        fprintf(stderr, "Connector startup failed\n");
        return EXIT_FAILURE;
    }

    connector->run();

    connector->shutdown();

    return EXIT_SUCCESS;
}
