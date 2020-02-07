#ifndef ENEBULAR_AGENT_FCC_DEV_FLOW_H
#define ENEBULAR_AGENT_FCC_DEV_FLOW_H

#ifdef __cplusplus
extern "C" {
#endif

#include "factory_configurator_client.h"

fcc_status_e enebular_agent_fcc_dev_flow(
        const char* mbed_cloud_dev_credentials_path);

#ifdef __cplusplus
}
#endif

#endif 


