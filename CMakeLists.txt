INCLUDE(CMakeForceCompiler)
# CROSS COMPILER SETTING
cmake_minimum_required (VERSION 2.8)
SET(CMAKE_SYSTEM_NAME Generic)

project(mbedCloudClientExample)

add_definitions(-DNS_EXCLUDE_HIGHRES_TIMER)
add_definitions(-DNS_EVENTLOOP_USE_TICK_TIMER)
add_definitions(-DMBED_CONF_MBED_CLIENT_EVENT_LOOP_SIZE=8192)
add_definitions(-DMBED_CONF_APP_CLOUD_MODE)
add_definitions(-DMBED_CONF_APP_DEVELOPER_MODE)

# mbed-cloud-client-example

include_directories(${CMAKE_CURRENT_SOURCE_DIR})
include_directories(${CMAKE_CURRENT_SOURCE_DIR}/source)
include_directories(${CMAKE_CURRENT_SOURCE_DIR}/platform/linux)

# mbed-cloud-client

SET(MBED_CLOUD_CLIENT_SOURCE_DIR ${CMAKE_CURRENT_SOURCE_DIR}/mbed-cloud-client)

include_directories(${MBED_CLOUD_CLIENT_SOURCE_DIR})
include_directories(${MBED_CLOUD_CLIENT_SOURCE_DIR}/mbed-cloud-client)
include_directories(${MBED_CLOUD_CLIENT_SOURCE_DIR}/source)
include_directories(${MBED_CLOUD_CLIENT_SOURCE_DIR}/source/include)

# mbed-client

SET(MBED_CLIENT_SOURCE_DIR ${MBED_CLOUD_CLIENT_SOURCE_DIR}/mbed-client)

include_directories(${MBED_CLIENT_SOURCE_DIR})
include_directories(${MBED_CLIENT_SOURCE_DIR}/mbed-client)
include_directories(${MBED_CLIENT_SOURCE_DIR}/source)
include_directories(${MBED_CLIENT_SOURCE_DIR}/source/include)
include_directories(${MBED_CLIENT_SOURCE_DIR}/mbed-client-c)
include_directories(${MBED_CLIENT_SOURCE_DIR}/mbed-client-c/nsdl-c)
include_directories(${MBED_CLIENT_SOURCE_DIR}/mbed-client-c/source/include)
include_directories(${MBED_CLIENT_SOURCE_DIR}/mbed-client-classic)
include_directories(${MBED_CLIENT_SOURCE_DIR}/mbed-client-classic/mbed-client-classic)
include_directories(${MBED_CLIENT_SOURCE_DIR}/mbed-client-mbed-tls)
include_directories(${MBED_CLIENT_SOURCE_DIR}/mbed-client-mbed-tls/mbed-client-mbedtls)

# pal headers

SET(PAL_SOURCE_DIR ${MBED_CLOUD_CLIENT_SOURCE_DIR}/mbed-client-pal/Source)

include_directories(${PAL_SOURCE_DIR}/PAL-Impl/Services-API)
include_directories(${PAL_SOURCE_DIR}/Port/Platform-API)

# common components

include_directories(${MBED_CLOUD_CLIENT_SOURCE_DIR}/mbed-coap)
include_directories(${MBED_CLOUD_CLIENT_SOURCE_DIR}/mbed-coap/mbed-coap)
include_directories(${MBED_CLOUD_CLIENT_SOURCE_DIR}/mbed-coap/source/include)
include_directories(${MBED_CLOUD_CLIENT_SOURCE_DIR}/mbed-trace)
include_directories(${MBED_CLOUD_CLIENT_SOURCE_DIR}/mbed-trace/mbed-trace)
include_directories(${MBED_CLOUD_CLIENT_SOURCE_DIR}/mbed-client-randlib)
include_directories(${MBED_CLOUD_CLIENT_SOURCE_DIR}/mbed-client-randlib/mbed-client-randlib)
include_directories(${MBED_CLOUD_CLIENT_SOURCE_DIR}/mbed-client-randlib/mbed-client-randlib/platform)
include_directories(${MBED_CLOUD_CLIENT_SOURCE_DIR}/nanostack-libservice)
include_directories(${MBED_CLOUD_CLIENT_SOURCE_DIR}/nanostack-libservice/mbed-client-libservice)
include_directories(${MBED_CLOUD_CLIENT_SOURCE_DIR}/nanostack-libservice/mbed-client-libservice/platform)
include_directories(${MBED_CLOUD_CLIENT_SOURCE_DIR}/sal-stack-nanostack-eventloop)
include_directories(${MBED_CLOUD_CLIENT_SOURCE_DIR}/sal-stack-nanostack-eventloop/nanostack-event-loop)
include_directories(${MBED_CLOUD_CLIENT_SOURCE_DIR}/ns-hal-pal)

# factory-client

SET(FACTORY_CLIENT_SOURCE_DIR ${MBED_CLOUD_CLIENT_SOURCE_DIR}/factory_client)

include_directories(${FACTORY_CLIENT_SOURCE_DIR}/factory_configurator_client/source/include)
include_directories(${FACTORY_CLIENT_SOURCE_DIR}/factory_configurator_client/factory_configurator_client)
include_directories(${FACTORY_CLIENT_SOURCE_DIR}/mbed-trace-helper/mbed-trace-helper)
include_directories(${FACTORY_CLIENT_SOURCE_DIR}/fc_protocol_handler/fc_protocol_handler)
include_directories(${FACTORY_CLIENT_SOURCE_DIR}/fc_protocol_handler/source/include)
include_directories(${FACTORY_CLIENT_SOURCE_DIR}/secure_store)
include_directories(${FACTORY_CLIENT_SOURCE_DIR}/secure_store/secure_store)
include_directories(${FACTORY_CLIENT_SOURCE_DIR}/storage)
include_directories(${FACTORY_CLIENT_SOURCE_DIR}/storage/storage)
include_directories(${FACTORY_CLIENT_SOURCE_DIR}/key_config_manager)
include_directories(${FACTORY_CLIENT_SOURCE_DIR}/key_config_manager/key_config_manager)
include_directories(${FACTORY_CLIENT_SOURCE_DIR}/key_config_manager/source/include)
include_directories(${FACTORY_CLIENT_SOURCE_DIR}/utils)
include_directories(${FACTORY_CLIENT_SOURCE_DIR}/utils/utils)
include_directories(${FACTORY_CLIENT_SOURCE_DIR}/logger)
include_directories(${FACTORY_CLIENT_SOURCE_DIR}/logger/logger)
include_directories(${FACTORY_CLIENT_SOURCE_DIR}/mbed-client-esfs/source/include)
include_directories(${FACTORY_CLIENT_SOURCE_DIR}/mbed-client-esfs/source-pal/api)
include_directories(${FACTORY_CLIENT_SOURCE_DIR}/mbed-client-esfs/source-pal/linux)
include_directories(${FACTORY_CLIENT_SOURCE_DIR}/crypto_service/crypto_service)
include_directories(${FACTORY_CLIENT_SOURCE_DIR}/crypto_service/source/include)
include_directories(${FACTORY_CLIENT_SOURCE_DIR}/secsrv-cbor/secsrv-cbor)
include_directories(${FACTORY_CLIENT_SOURCE_DIR}/fcc_bundle_handler/fcc_bundle_handler)
include_directories(${FACTORY_CLIENT_SOURCE_DIR}/fcc_bundle_handler/source/include)

# update-client

SET(UPDATE_SOURCE_DIR ${MBED_CLOUD_CLIENT_SOURCE_DIR}/update-client-hub)

include_directories(${UPDATE_SOURCE_DIR})
include_directories(${UPDATE_SOURCE_DIR}/update-client-hub)
include_directories(${UPDATE_SOURCE_DIR}/modules/common)
include_directories(${UPDATE_SOURCE_DIR}/modules/common/update-client-common)
include_directories(${UPDATE_SOURCE_DIR}/modules/atomic-queue)
include_directories(${UPDATE_SOURCE_DIR}/modules/atomic-queue/atomic-queue)
include_directories(${UPDATE_SOURCE_DIR}/modules/source)
include_directories(${UPDATE_SOURCE_DIR}/modules/source/update-client-source)
include_directories(${UPDATE_SOURCE_DIR}/modules/control-center)
include_directories(${UPDATE_SOURCE_DIR}/modules/control-center/update-client-control-center)
include_directories(${UPDATE_SOURCE_DIR}/modules/firmware-manager)
include_directories(${UPDATE_SOURCE_DIR}/modules/firmware-manager/update-client-firmware-manager)
include_directories(${UPDATE_SOURCE_DIR}/modules/device-identity)
include_directories(${UPDATE_SOURCE_DIR}/modules/device-identity/pal4life-device-identity)
include_directories(${UPDATE_SOURCE_DIR}/modules/lwm2m-mbed)
include_directories(${UPDATE_SOURCE_DIR}/modules/lwm2m-mbed/update-client-lwm2m)
include_directories(${UPDATE_SOURCE_DIR}/modules/source-http)
include_directories(${UPDATE_SOURCE_DIR}/modules/source-http/update-client-source-http)
include_directories(${UPDATE_SOURCE_DIR}/modules/source-manager)
include_directories(${UPDATE_SOURCE_DIR}/modules/source-manager/update-client-source-manager)
include_directories(${UPDATE_SOURCE_DIR}/modules/manifest-manager)
include_directories(${UPDATE_SOURCE_DIR}/modules/manifest-manager/update-client-manifest-manager)
include_directories(${UPDATE_SOURCE_DIR}/modules/manifest-manager/source)
include_directories(${UPDATE_SOURCE_DIR}/modules/source-http-socket)
include_directories(${UPDATE_SOURCE_DIR}/modules/source-http-socket/update-client-source-http-socket)
include_directories(${UPDATE_SOURCE_DIR}/modules/device)
include_directories(${UPDATE_SOURCE_DIR}/modules/device/update-client-device)
include_directories(${UPDATE_SOURCE_DIR}/modules/monitor)
include_directories(${UPDATE_SOURCE_DIR}/modules/monitor/update-client-monitor)

FILE(GLOB MBED_CLOUD_CLIENT_EXAMPLE_SRC
    "${CMAKE_CURRENT_SOURCE_DIR}/*.cpp"
    "${CMAKE_CURRENT_SOURCE_DIR}/*.c"
    "${CMAKE_CURRENT_SOURCE_DIR}/source/*.c"
    "${CMAKE_CURRENT_SOURCE_DIR}/source/*.cpp"

    "${CMAKE_CURRENT_SOURCE_DIR}/platform/linux/*.cpp"

    "${MBED_CLOUD_CLIENT_SOURCE_DIR}/source/*.c"
    "${MBED_CLOUD_CLIENT_SOURCE_DIR}/source/*.cpp"

    "${MBED_CLOUD_CLIENT_SOURCE_DIR}/mbed-coap/source/*.c"
    "${MBED_CLOUD_CLIENT_SOURCE_DIR}/mbed-client-randlib/source/*.c"

    "${MBED_CLIENT_SOURCE_DIR}/source/*.cpp"
    "${MBED_CLIENT_SOURCE_DIR}/mbed-client-c/source/*.c"
    "${MBED_CLIENT_SOURCE_DIR}/mbed-client-classic/source/*.cpp"
    "${MBED_CLIENT_SOURCE_DIR}/mbed-client-mbed-tls/source/*.cpp"

    "${FACTORY_CLIENT_SOURCE_DIR}/source/*.c"
    "${FACTORY_CLIENT_SOURCE_DIR}/factory_configurator_client/source/*.c"
    "${FACTORY_CLIENT_SOURCE_DIR}/storage/source/*.c"
    "${FACTORY_CLIENT_SOURCE_DIR}/secure_store/source/*.c"
    "${FACTORY_CLIENT_SOURCE_DIR}/key_config_manager/source/*.c"
    "${FACTORY_CLIENT_SOURCE_DIR}/utils/source/*.c"
    "${FACTORY_CLIENT_SOURCE_DIR}/logger/source/*.c"
    "${FACTORY_CLIENT_SOURCE_DIR}/mbed-client-esfs/source/*.c"
    "${FACTORY_CLIENT_SOURCE_DIR}/mbed-client-esfs/source-pal/linux/*.c"
    "${FACTORY_CLIENT_SOURCE_DIR}/mbed-client-esfs/source-pal/linux/*.cpp"
    "${FACTORY_CLIENT_SOURCE_DIR}/crypto_service/source/*.c"
    "${FACTORY_CLIENT_SOURCE_DIR}/fc_protocol_handler/source/*.c"
    "${FACTORY_CLIENT_SOURCE_DIR}/secsrv-cbor/source/*.c"
    "${FACTORY_CLIENT_SOURCE_DIR}/fcc_bundle_handler/source/*.c"
    )

CREATE_TEST_LIBRARY(mbedCloudClientExample "${MBED_CLOUD_CLIENT_EXAMPLE_SRC}" "")

add_dependencies(mbedCloudClientExample mbedCloudClient)

ADDSUBDIRS()
