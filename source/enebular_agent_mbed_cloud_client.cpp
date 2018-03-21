
#include <cstdio>
#include "enebular_agent_mbed_cloud_client.h"

#ifdef MBED_CLOUD_CLIENT_SUPPORT_UPDATE
void update_authorize(int32_t request);
void update_progress(uint32_t progress, uint32_t total);
#endif

EnebularAgentMbedCloudClient::EnebularAgentMbedCloudClient()
{
    _registered = false;
}

EnebularAgentMbedCloudClient::~EnebularAgentMbedCloudClient()
{
}

void EnebularAgentMbedCloudClient::add_object(M2MObject *object)
{
    _object_list.push_back(object);
}

bool EnebularAgentMbedCloudClient::setup()
{
    _cloud_client.add_objects(_object_list);

    _cloud_client.on_registered(this, &EnebularAgentMbedCloudClient::client_registered);
    _cloud_client.on_registration_updated(this, &EnebularAgentMbedCloudClient::client_registration_updated);
    _cloud_client.on_unregistered(this, &EnebularAgentMbedCloudClient::client_unregistered);
    _cloud_client.on_error(this, &EnebularAgentMbedCloudClient::client_error);

#ifdef MBED_CLOUD_CLIENT_SUPPORT_UPDATE
    _cloud_client.set_update_authorize_handler(update_authorize);
    _cloud_client.set_update_progress_handler(update_progress);
#endif

    //todo: set_update_callback(MbedCloudClientCallback *callback)

    return true;
}

bool EnebularAgentMbedCloudClient::connect(void *iface)
{
    bool setup = _cloud_client.setup(iface);
    if (!setup) {
        return false;
    }
}

bool EnebularAgentMbedCloudClient::disconnect()
{
    _cloud_client.close();
}

bool EnebularAgentMbedCloudClient::is_connected()
{
    return _registered;
}

void EnebularAgentMbedCloudClient::client_registered()
{
    _registered = true;

    printf("Client registered\n");

    const ConnectorClientEndpointInfo * info = _cloud_client.endpoint_info();
    if (info) {
#if MBED_CONF_APP_DEVELOPER_MODE != 1
        printf("Endpoint Name: %s\n", info->endpoint_name.c_str());
#endif
        printf("Device ID: %s\n", info->internal_endpoint_name.c_str());
    }
}

void EnebularAgentMbedCloudClient::client_registration_updated()
{
    printf("Client registration updated\n");
}

void EnebularAgentMbedCloudClient::client_unregistered()
{
    _registered = false;

    printf("Client unregistered\n");
}

void EnebularAgentMbedCloudClient::client_error(int error_code)
{
    const char * err;

    switch(error_code) {
        case MbedCloudClient::ConnectErrorNone:
            err = "ConnectErrorNone";
            break;
        case MbedCloudClient::ConnectAlreadyExists:
            err = "ConnectAlreadyExists";
            break;
        case MbedCloudClient::ConnectBootstrapFailed:
            err = "ConnectBootstrapFailed";
            break;
        case MbedCloudClient::ConnectInvalidParameters:
            err = "ConnectInvalidParameters";
            break;
        case MbedCloudClient::ConnectNotRegistered:
            err = "ConnectNotRegistered";
            break;
        case MbedCloudClient::ConnectTimeout:
            err = "ConnectTimeout";
            break;
        case MbedCloudClient::ConnectNetworkError:
            err = "ConnectNetworkError";
            break;
        case MbedCloudClient::ConnectResponseParseFailed:
            err = "ConnectResponseParseFailed";
            break;
        case MbedCloudClient::ConnectUnknownError:
            err = "ConnectUnknownError";
            break;
        case MbedCloudClient::ConnectMemoryConnectFail:
            err = "ConnectMemoryConnectFail";
            break;
        case MbedCloudClient::ConnectNotAllowed:
            err = "ConnectNotAllowed";
            break;
        case MbedCloudClient::ConnectSecureConnectionFailed:
            err = "ConnectSecureConnectionFailed";
            break;
        case MbedCloudClient::ConnectDnsResolvingFailed:
            err = "ConnectDnsResolvingFailed";
            break;
#ifdef MBED_CLOUD_CLIENT_SUPPORT_UPDATE
        case MbedCloudClient::UpdateWarningCertificateNotFound:
            err = "UpdateWarningCertificateNotFound";
            break;
        case MbedCloudClient::UpdateWarningIdentityNotFound:
            err = "UpdateWarningIdentityNotFound";
            break;
        case MbedCloudClient::UpdateWarningCertificateInvalid:
            err = "UpdateWarningCertificateInvalid";
            break;
        case MbedCloudClient::UpdateWarningSignatureInvalid:
            err = "UpdateWarningSignatureInvalid";
            break;
        case MbedCloudClient::UpdateWarningVendorMismatch:
            err = "UpdateWarningVendorMismatch";
            break;
        case MbedCloudClient::UpdateWarningClassMismatch:
            err = "UpdateWarningClassMismatch";
            break;
        case MbedCloudClient::UpdateWarningDeviceMismatch:
            err = "UpdateWarningDeviceMismatch";
            break;
        case MbedCloudClient::UpdateWarningURINotFound:
            err = "UpdateWarningURINotFound";
            break;
        case MbedCloudClient::UpdateWarningRollbackProtection:
            err = "UpdateWarningRollbackProtection";
            break;
        case MbedCloudClient::UpdateWarningUnknown:
            err = "UpdateWarningUnknown";
            break;
        case MbedCloudClient::UpdateErrorWriteToStorage:
            err = "UpdateErrorWriteToStorage";
            break;
        case MbedCloudClient::UpdateErrorInvalidHash:
            err = "UpdateErrorInvalidHash";
            break;
#endif
        default:
            err = "UNKNOWN";
    }

    printf("Client error occurred: %s (%d)\n", err, error_code);
    printf("Error details: %s\n", _cloud_client.error_description());
}
