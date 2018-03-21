
#ifndef ENEBULAR_AGENT_MBED_CLOUD_CLIENT_H
#define ENEBULAR_AGENT_MBED_CLOUD_CLIENT_H

#include "mbed-cloud-client/MbedCloudClient.h"

class EnebularAgentMbedCloudClient {

public:

    /** Constructor
     */
    EnebularAgentMbedCloudClient();

    /** Deconstructor
     */
    ~EnebularAgentMbedCloudClient();

    /** Sets up the client ready for connection.
     * @param iface A handler to the network interface on mbedOS, can be NULL on
     *              other platforms.
     */
    bool setup(void *iface);

    bool connect();

    bool disconnect();

    bool isConnected();

private:

    bool _registered;

    M2MObjectList _object_list;

    MbedCloudClient _mbed_cloud_client;

};

#endif // ENEBULAR_AGENT_MBED_CLOUD_CLIENT_H
