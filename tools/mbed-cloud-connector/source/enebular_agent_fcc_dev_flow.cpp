#include <fstream>
#include <vector>
#include <sstream>

#include "enebular_agent_fcc_dev_flow.h"
#include "key_config_manager.h"
#include "pv_error_handling.h"

using namespace std;

enum item_c_type {
    ITEM_C_TYPE_STRING,
    ITEM_C_TYPE_UINT32,
    ITEM_C_TYPE_UINT8_ARRAY
};

typedef struct fcc_deloveper_mode_item_params {
    const char *item_name;
    kcm_item_type_e item_kcm_type;
    enum item_c_type c_type;
    const char *var_name;
} fcc_deloveper_mode_item_params_s;

const fcc_deloveper_mode_item_params_s c_file_items[] = {
    { g_fcc_endpoint_parameter_name,               KCM_CONFIG_ITEM,       ITEM_C_TYPE_STRING,      "MBED_CLOUD_DEV_BOOTSTRAP_ENDPOINT_NAME" },
    { g_fcc_bootstrap_server_uri_name,             KCM_CONFIG_ITEM,       ITEM_C_TYPE_STRING,      "MBED_CLOUD_DEV_BOOTSTRAP_SERVER_URI" },
    { g_fcc_bootstrap_device_certificate_name,     KCM_CERTIFICATE_ITEM,  ITEM_C_TYPE_UINT8_ARRAY, "MBED_CLOUD_DEV_BOOTSTRAP_DEVICE_CERTIFICATE" },
    { g_fcc_bootstrap_server_ca_certificate_name,  KCM_CERTIFICATE_ITEM,  ITEM_C_TYPE_UINT8_ARRAY, "MBED_CLOUD_DEV_BOOTSTRAP_SERVER_ROOT_CA_CERTIFICATE" },
    { g_fcc_bootstrap_device_private_key_name,     KCM_PRIVATE_KEY_ITEM,  ITEM_C_TYPE_UINT8_ARRAY, "MBED_CLOUD_DEV_BOOTSTRAP_DEVICE_PRIVATE_KEY" },

    { g_fcc_manufacturer_parameter_name,           KCM_CONFIG_ITEM,       ITEM_C_TYPE_STRING,       "MBED_CLOUD_DEV_MANUFACTURER" },
    { g_fcc_model_number_parameter_name,           KCM_CONFIG_ITEM,       ITEM_C_TYPE_STRING,       "MBED_CLOUD_DEV_MODEL_NUMBER" },
    { g_fcc_device_serial_number_parameter_name,   KCM_CONFIG_ITEM,       ITEM_C_TYPE_STRING,       "MBED_CLOUD_DEV_SERIAL_NUMBER" },
    { g_fcc_device_type_parameter_name,            KCM_CONFIG_ITEM,       ITEM_C_TYPE_STRING,       "MBED_CLOUD_DEV_DEVICE_TYPE" },
    { g_fcc_hardware_version_parameter_name,       KCM_CONFIG_ITEM,       ITEM_C_TYPE_STRING,       "MBED_CLOUD_DEV_HARDWARE_VERSION" },
    { g_fcc_memory_size_parameter_name,            KCM_CONFIG_ITEM,       ITEM_C_TYPE_UINT32,       "MBED_CLOUD_DEV_MEMORY_TOTAL_KB" },
};

#ifdef __cplusplus
extern "C" {
#endif
fcc_status_e fcc_convert_kcm_to_fcc_status(kcm_status_e kcm_result);
#ifdef __cplusplus
}
#endif

fcc_status_e enebular_agent_fcc_dev_flow_add_param(const char *item_name,
        kcm_item_type_e item_kcm_type, const uint8_t *item_data, const uint32_t item_data_size)
{
    kcm_status_e kcm_status = KCM_STATUS_SUCCESS;
    const bool is_factory_item = true;

    kcm_status = kcm_item_store((const uint8_t*)item_name, strlen(item_name), item_kcm_type, is_factory_item,
                                item_data, item_data_size, NULL);

    if (kcm_status != KCM_STATUS_SUCCESS) {
        fprintf(stderr, "Store status: %d, Failed to store %s", kcm_status, item_name);
    }
    return fcc_convert_kcm_to_fcc_status(kcm_status);
}

fcc_status_e enebular_agent_fcc_dev_flow_generate_bundle(void)
{
    fcc_status_e fcc_status = FCC_STATUS_SUCCESS;

    fcc_status = fcc_trust_ca_cert_id_set();
    if (fcc_status != FCC_STATUS_SUCCESS) {
        fprintf(stderr, "Failed to set ca certificate identifier");
    }
    return fcc_status;
}

vector<string> split(const string &s, char delim)
{
    vector<string> elems;
    stringstream ss(s);
    string item;

    while (getline(ss, item, delim)) {
        *(back_inserter(elems)++) = item;
    }
    return elems;
}

fcc_status_e parse_array(ifstream& _file, const fcc_deloveper_mode_item_params_s *c_file_item)
{
    string line;
    string array_str;
    vector<string> segments;

    while(_file.good()) {
        getline(_file, line);
        array_str += line;
        if (line.find("}") != string::npos) {
            segments = split(array_str.substr(2, array_str.size() - 5), ',');
            uint8_t array[segments.size()];
            for(vector<string>::size_type i = 0; i != segments.size(); i++) {
                array[i] = (uint8_t )strtol(segments[i].c_str(), NULL, 16);
            }
            enebular_agent_fcc_dev_flow_add_param(c_file_item->item_name,
                    c_file_item->item_kcm_type, (const uint8_t*)array, sizeof(array));
            return FCC_STATUS_SUCCESS;
        }
    }
    return FCC_STATUS_ERROR;
}

fcc_status_e dev_credentials_parse(const char* file)
{
    ifstream _file;
    string line;
    int index = 0;
    fcc_status_e ret = FCC_STATUS_SUCCESS;

    _file.open(file);
    if (!_file) {
        fprintf(stderr, "Open file %s\n failed\n", file);
        return FCC_STATUS_ERROR;
    }

    while(_file.good() && index < (sizeof(c_file_items) /
            sizeof(fcc_deloveper_mode_item_params_s))) {
        const fcc_deloveper_mode_item_params_s *c_file_item = &c_file_items[index];
        getline(_file, line);

        if (line.find(c_file_item->var_name) != string::npos) {
            vector<string> segments;

            switch(c_file_item->c_type) {
            case ITEM_C_TYPE_UINT8_ARRAY:
                if (parse_array(_file, c_file_item) != FCC_STATUS_SUCCESS) {
                    fprintf(stderr, "credential file syntex error\n");
                    ret = FCC_STATUS_INVALID_PARAMETER;
                    goto err_end;
                }
                break;
            case ITEM_C_TYPE_UINT32: {
                uint32_t int_value;
                segments = split(line, ' ');
                if (segments.size() != 5) {
                    fprintf(stderr, "credential file syntex error\n");
                    ret = FCC_STATUS_INVALID_PARAMETER;
                    goto err_end;
                }
                int_value = atoi((segments.begin() + 4)->c_str());
                // printf("%d\n", int_value);
                enebular_agent_fcc_dev_flow_add_param(c_file_item->item_name,
                        c_file_item->item_kcm_type, (const uint8_t*)&int_value, sizeof(uint32_t));
                break;
            }
            case ITEM_C_TYPE_STRING: {
                segments = split(line, '"');
                if (segments.size() != 3) {
                    fprintf(stderr, "credential file syntex error\n");
                    ret = FCC_STATUS_INVALID_PARAMETER;
                    goto err_end;
                }
                const char* value = (segments.begin() + 1)->c_str();
                // printf("%s\n", value);
                enebular_agent_fcc_dev_flow_add_param(c_file_item->item_name,
                        c_file_item->item_kcm_type, (const uint8_t*)value, strlen(value));
                break;
            }
            default:
                ret = FCC_STATUS_INVALID_PARAMETER;
                goto err_end;
            }
            index++;
        }
    }
err_end:
    _file.close();
    return ret;
}

fcc_status_e enebular_agent_fcc_dev_flow(
        const char* mbed_cloud_dev_credentials_path)
{
    fcc_status_e fcc_status = FCC_STATUS_SUCCESS;

    static const uint32_t is_bootstrap_mode = 1;
    fcc_status = enebular_agent_fcc_dev_flow_add_param(g_fcc_use_bootstrap_parameter_name,
            KCM_CONFIG_ITEM, (const uint8_t*)&is_bootstrap_mode, sizeof(uint32_t));
    if (fcc_status != FCC_STATUS_SUCCESS)
        return fcc_status;

    fcc_status = dev_credentials_parse(mbed_cloud_dev_credentials_path);
    if (fcc_status != FCC_STATUS_SUCCESS)
        return fcc_status;
    return enebular_agent_fcc_dev_flow_generate_bundle();
}
