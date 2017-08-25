SET(TLS_LIBRARY mbedTLS)
SET(CMAKE_C_FLAGS_RELEASE "${CMAKE_C_FLAGS_RELEASE} -fomit-frame-pointer")
SET(ENABLE_PROGRAMS OFF CACHE STRING "Avoid compiling mbedtls programs" )
SET(ENABLE_TESTING OFF CACHE STRING "Avoid compiling mbedtls tests")

include_directories ("${CMAKE_SOURCE_DIR}/pal-platform/Middleware/mbedtls")
include_directories ("${CMAKE_SOURCE_DIR}/pal-platform/Middleware/mbedtls/mbedtls/include")
include_directories ("${CMAKE_SOURCE_DIR}/pal-platform/Middleware/mbedtls/mbedtls/include/mbedtls")
include_directories ("${CMAKE_SOURCE_DIR}/pal-platform/Middleware/mbedtls/mbedtls/port/ksdk")
# include_directories ("./pal-platform/Middleware/mbedtls/mmcau_2.0.0")

message(status "device = ${PAL_TARGET_DEVICE}")
set (EXTRA_CMAKE_DIRS ${EXTRA_CMAKE_DIRS} "${CMAKE_SOURCE_DIR}/pal-platform/Middleware/mbedtls/mbedtls")

list (APPEND SRC_LIBS mbedtls mbedcrypto mbedx509)
      
