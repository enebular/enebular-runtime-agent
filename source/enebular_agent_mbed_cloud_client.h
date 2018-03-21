
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

    // todo: add_objects is external like this or handled internally?
    void add_object(M2MObject *object);

    // todo: standard device objects/resources?

    /** Sets up the client ready for connection.
     * @param iface A handler to the network interface on mbedOS, can be NULL on
     *              other platforms.
     */
    bool setup();

    bool connect(void *iface);

    bool disconnect();

    bool is_connected();

private:

    MbedCloudClient _cloud_client;
    M2MObjectList _object_list;
    bool _registered;

    void client_registered();
    void client_registration_updated();
    void client_unregistered();
    void client_error(int error_code);

};

#endif // ENEBULAR_AGENT_MBED_CLOUD_CLIENT_H
