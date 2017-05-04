SET(TLS_LIBRARY mbedTLS)
SET(CMAKE_C_FLAGS_RELEASE "${CMAKE_C_FLAGS_RELEASE} -fomit-frame-pointer")
SET(ENABLE_PROGRAMS OFF CACHE STRING "Avoid compiling mbedtls programs" )
SET(ENABLE_TESTING OFF CACHE STRING "Avoid compiling mbedtls tests")

include_directories ("${CMAKE_SOURCE_DIR}/pal-platform/Middleware/mbedtls/mbedtls")
include_directories ("${CMAKE_SOURCE_DIR}/pal-platform/Middleware/mbedtls/mbedtls/include")
include_directories ("${CMAKE_SOURCE_DIR}/pal-platform/Middleware/mbedtls/mbedtls/include/mbedtls")
include_directories ("${CMAKE_SOURCE_DIR}/pal-platform/Middleware/mbedtls/mbedtls/port/ksdk")
# include_directories ("./pal-platform/Middleware/mbedtls/mmcau_2.0.0")

message(status "device = ${PAL_TARGET_DEVICE}")
# if (${PAL_TARGET_DEVICE} MATCHES "MK64F")
#         add_definitions(" -DFREESCALE_KSDK_BM")
#         add_definitions(" -DFREESCALE_KSDK_BM")
#         add_definitions(" -DMBEDTLS_CONFIG_FILE='\"ksdk_mbedtls_config.h\"'")
#         add_definitions(" -DMBEDTLS_CONFIG_FILE='\"ksdk_mbedtls_config.h\"'")
#         
#         list(APPEND MainBin_SRCS "./pal-platform/Middleware/mbedtls_2.1.2/mbedtls_2.1.2/port/ksdk/ksdk_mbedtls.c")
#         
#         # Try to use HW crypto acceleration                     
#         list(APPEND MainBin_SRCS "./pal-platform/Middleware/mbedtls_2.1.2/mmcau_2.0.0/fsl_mmcau.c")
#         link_directories(./pal-platform/Middleware/mbedtls_2.1.2/mmcau_2.0.0/asm-cm4-cm7)
#         set (EXTRA_LIBS ${EXTRA_LIBS} optimized ./pal-platform/Middleware/mbedtls_2.1.2/mmcau_2.0.0/asm-cm4-cm7/lib_mmcau.a)
#         set (EXTRA_LIBS ${EXTRA_LIBS} debug ./pal-platform/Middleware/mbedtls_2.1.2/mmcau_2.0.0/asm-cm4-cm7/lib_mmcau.a)              
# endif()

# Additional directories to look for CMakeLists.txt
#       add_subdirectory ("${PROJECT_SOURCE_DIR}/Non-Dist/Middleware/mbedtls_2.1.2")
set (EXTRA_CMAKE_DIRS ${EXTRA_CMAKE_DIRS} "${CMAKE_SOURCE_DIR}/pal-platform/Middleware/mbedtls/mbedtls")
add_definitions(-DMBEDTLS_CMAC_C)

execute_process(COMMAND bash "-c" "sed -i 's/#define MBEDTLS_HAVE_TIME_DATE/#undef MBEDTLS_HAVE_TIME_DATE/' ${CMAKE_SOURCE_DIR}/pal-platform/Middleware/mbedtls/mbedtls/include/mbedtls/config.h")

if (PAL_CERT_TIME_VERIFY)
	add_definitions(-DMBEDTLS_PLATFORM_TIME_ALT)
    add_definitions(-DMBEDTLS_HAVE_TIME_DATE)
endif()
list (APPEND SRC_LIBS mbedtls mbedcrypto mbedx509)
      
