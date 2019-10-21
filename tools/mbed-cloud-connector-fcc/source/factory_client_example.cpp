// ----------------------------------------------------------------------------
// Copyright 2016-2017 ARM Ltd.
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

// Note: this macro is needed on armcc to get the the PRI*32 macros
// from inttypes.h in a C++ code.
#ifndef __STDC_FORMAT_MACROS
#define __STDC_FORMAT_MACROS
#endif

#include <stdio.h>
#include <stdlib.h>
#include <inttypes.h>
#include <unistd.h>
#include <fcntl.h>
#include <errno.h>
#include <sys/types.h>
#include <sys/stat.h>

#include "common_setup.h"
#include "factory_configurator_client.h"
#include "ftcd_comm_base.h"
#include "fce_common_helper.h"
#include "mbed-trace/mbed_trace.h"
#include "mbed-trace-helper.h"
#include "fcc_malloc.h"
#include "fcc_stats.h"
#include "fcc_bundle_handler.h"

#define TRACE_GROUP     "fce"  // Maximum 4 characters

static int factory_example_success = EXIT_FAILURE;
static int g_argc;
static char **g_argv;

static int factory_flow_file(const char * path)
{
    uint8_t * bundle;
    size_t bundle_size;
    uint8_t * response_bundle = NULL;
    size_t response_bundle_size;
    fcc_status_e fcc_status;
    struct stat stats;
    int fd;
    int read_total = 0;
    int ret;

    ret = stat(path, &stats);
    if (ret < 0) {
        tr_error("Failed to get bundle file size");
        return -1;
    }
    bundle_size = stats.st_size;

    fd = open(path, O_RDONLY);
    if (fd < 0) {
        tr_error("Failed to open bundle");
        return -1;
    }

    bundle = (uint8_t *)malloc(bundle_size);
    if (!bundle) {
        close(fd);
        return -1;
    }

    while (read_total < bundle_size) {
        ret = read(fd, &bundle[read_total], bundle_size-read_total);
        if (ret < 0) {
            if (errno != EINTR) {
                break;
            }
        } else if (ret == 0) {
            break;
        } else {
            read_total += ret;
        }
    }
    close(fd);

    if (read_total != bundle_size) {
        tr_error("Failed to read full bundle");
        free(bundle);
        return -1;
    }

    fcc_status = fcc_bundle_handler(bundle,
            bundle_size,
            &response_bundle,
            &response_bundle_size);
    free(bundle);
    if ((fcc_status != FCC_STATUS_SUCCESS) ||
            (response_bundle == NULL) ||
            (response_bundle_size == 0)) {
        tr_error("Failed to handle bundle");
        return -1;
    } else {
        free(response_bundle);
        printf("Successfully handled file bundle\n");
    }

    return 0;
}

static int factory_flow_comm(void)
{
    FtcdCommBase *ftcd_comm;
    uint8_t *input_message = NULL;
    uint32_t input_message_size = 0;
    uint8_t *response_message = NULL;
    size_t response_message_size = 0;
    ftcd_comm_status_e ftcd_comm_status;
    fcc_status_e fcc_status;
    bool bundle_handled = false;
    bool success;

    // Create communication interface object
    ftcd_comm = fce_create_comm_interface();
    if (ftcd_comm == NULL) {
        tr_error("Failed creating communication object\n");
        return -1;
    }

    //init ftcd_comm object
    success = ftcd_comm->init();
    if (success != true) {
        tr_error("Failed instantiating communication object\n");
        goto out;
    }

    // wait for message from communication layer
    ftcd_comm_status = ftcd_comm->wait_for_message(&input_message, &input_message_size);
    if (ftcd_comm_status != FTCD_COMM_STATUS_SUCCESS) {
        tr_error("Failed getting factory message");
        goto out;
    }

    // process request and get back response
    fcc_status = fcc_bundle_handler(input_message, input_message_size, &response_message, &response_message_size);
    if ((fcc_status == FCC_STATUS_BUNDLE_RESPONSE_ERROR) || (response_message == NULL) || (response_message_size == 0)) {
        mbed_tracef(TRACE_LEVEL_CMD, TRACE_GROUP, "Failed to process data");
        goto out;
    }

    ftcd_comm_status = ftcd_comm->send_response(response_message, response_message_size, ftcd_comm_status);
    if (ftcd_comm_status != FTCD_COMM_STATUS_SUCCESS) {
        ftcd_comm->send_response(NULL, 0, ftcd_comm_status);
    } else {
        mbed_tracef(TRACE_LEVEL_CMD, TRACE_GROUP, "Successfully processed comm message");
        bundle_handled = true;
    }

out:
    if (input_message) {
        fcc_free(input_message);
    }
    if (response_message) {
        fcc_free(response_message);
    }
    ftcd_comm->finish();
    delete ftcd_comm;
    fce_destroy_comm_interface();
    return (bundle_handled) ? 0 : -1;
}

/**
* Device factory flow
* - Runs in a task of its own
*/
static void factory_flow_task()
{
    fcc_status_e fcc_status = FCC_STATUS_SUCCESS;
    bool success;
    int ret;

    mcc_platform_sw_build_info();

    // Initialize storage
    success = mcc_platform_storage_init() == 0;
    if (success != true) {
        tr_error("Failed initializing mcc platform storage\n");
        return;
    }

    fcc_status = fcc_init();
    if (fcc_status != FCC_STATUS_SUCCESS) {
        tr_error("Failed initializing factory configurator client\n");
        return;
    }

    setvbuf(stdout, (char *)NULL, _IONBF, 0); /* Avoid buffering on test output */

    mbed_tracef(TRACE_LEVEL_CMD, TRACE_GROUP, "Factory flow begins...");

    fcc_status = fcc_storage_delete();
    if (fcc_status != FCC_STATUS_SUCCESS) {
        tr_error("Failed to reset storage\n");
        goto out;
    }

    if (g_argc == 2) {
        ret = factory_flow_file(g_argv[1]);
    } else {
        ret = factory_flow_comm();
    }
    if (ret == 0) {
        factory_example_success = EXIT_SUCCESS;
    }

out:
    mbed_trace_helper_finish();
    fcc_status = fcc_finalize();
    if (fcc_status != FCC_STATUS_SUCCESS) {
        tr_error("Failed finalizing factory client\n");
    }

    fflush(stdout);
}

/**
* Example main
*/
int main(int argc, char * argv[])
{
    bool success = false;

    g_argc = argc;
    g_argv = argv;

    // careful, mbed-trace initialization may happen at this point if and only if we 
    // do NOT use mutex by passing "true" at the second param for this functions.
    // In case mutex is used, this function MUST be moved *after* pal_init()
    success = mbed_trace_helper_init(TRACE_ACTIVE_LEVEL_ALL | TRACE_MODE_COLOR, false);
    if (!success) {
        // Nothing much can be done here, trace module should be initialized before file system
        // and if failed - no tr_* print is eligible.
        return EXIT_FAILURE;
    }

    success = false;

    success = (mcc_platform_init() == 0);
    if (success) {
        // setvbuf(stdout, (char *)NULL, _IONBF, 0); /* Avoid buffering on test output */
        success = mcc_platform_run_program(&factory_flow_task);
    }

    // Print dynamic RAM statistics in case ENABLE_RAM_PROFILING cflag introduced
    fcc_stats_print_summary();

    return success ? factory_example_success : EXIT_FAILURE;
}
