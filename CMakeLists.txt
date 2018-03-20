INCLUDE(CMakeForceCompiler)
# CROSS COMPILER SETTING
cmake_minimum_required (VERSION 2.8)
SET(CMAKE_SYSTEM_NAME Generic)

project(enebular-agent-mbed-cloud-connector)

add_definitions(-DNS_EXCLUDE_HIGHRES_TIMER)
add_definitions(-DNS_EVENTLOOP_USE_TICK_TIMER)
add_definitions(-DMBED_CONF_MBED_CLIENT_EVENT_LOOP_SIZE=8192)
add_definitions(-DMBED_CONF_MBED_CLIENT_DNS_THREAD_STACK_SIZE=102400)

set(EXAMPLE_INCLUDE "${CMAKE_CURRENT_SOURCE_DIR}/source/example/")
set(EXAMPLE_SOURCES "${CMAKE_CURRENT_SOURCE_DIR}/source/example/*.cpp")

include_directories(${CMAKE_CURRENT_SOURCE_DIR})
include_directories(${CMAKE_CURRENT_SOURCE_DIR}/source)
include_directories(${EXAMPLE_INCLUDE})

FILE(GLOB MBED_CLOUD_CLIENT_EXAMPLE_SRC
    "${CMAKE_CURRENT_SOURCE_DIR}/*.cpp"
    "${CMAKE_CURRENT_SOURCE_DIR}/*.c"
    "${CMAKE_CURRENT_SOURCE_DIR}/source/*.c"
    "${CMAKE_CURRENT_SOURCE_DIR}/source/*.cpp"
    "${EXAMPLE_SOURCES}"
    )

CREATE_TEST_LIBRARY(enebular-agent-mbed-cloud-connector "${MBED_CLOUD_CLIENT_EXAMPLE_SRC}" "")

add_dependencies(enebular-agent-mbed-cloud-connector mbedCloudClient)

ADDSUBDIRS()
