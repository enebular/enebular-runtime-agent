set(NETWORK_STACK LWIP)
add_definitions("-DUSE_RTOS=1")
add_definitions("-DLWIP_SOCKET")
SET_COMPILER_DBG_RLZ_FLAG (CMAKE_EXE_LINKER_FLAGS "-defsym=__ram_vector_table__=1")

#  additional directories to look for CMakeLists.txt
include_directories(./pal-platform/Middleware/lwip_1.4.1/lwip_1.4.1/port) 
include_directories(./pal-platform/Middleware/lwip_1.4.1/lwip_1.4.1/port/arch) 
include_directories(./pal-platform/Middleware/lwip_1.4.1/lwip_1.4.1/src) 
include_directories(./pal-platform/Middleware/lwip_1.4.1/lwip_1.4.1/src/include)
include_directories(./pal-platform/Middleware/lwip_1.4.1/lwip_1.4.1/src/include/ipv4)
include_directories(./pal-platform/Middleware/lwip_1.4.1/lwip_1.4.1/src/include/ipv4/lwip)
include_directories(./pal-platform/Middleware/lwip_1.4.1/lwip_1.4.1/src/include/ipv6)
include_directories(./pal-platform/Middleware/lwip_1.4.1/lwip_1.4.1/src/include/ipv6/lwip)
include_directories(./pal-platform/Middleware/lwip_1.4.1/lwip_1.4.1/src/include/lwip)
include_directories(./pal-platform/Middleware/lwip_1.4.1/lwip_1.4.1/src/include/netif)
include_directories(./pal-platform/Middleware/lwip_1.4.1/lwip_1.4.1/src/include/posix)             
include_directories(./pal-platform/Middleware/lwip_1.4.1/lwip_1.4.1/src/netif)             
include_directories(./pal-platform/Middleware/lwip_1.4.1/lwip_1.4.1/src/netif/ppp) 



#add_subdirectory ("./Platform/Middleware/lwip_1.4.1/lwip_1.4.1")
set (EXTRA_CMAKE_DIRS ${EXTRA_CMAKE_DIRS} "./pal-platform/Middleware/lwip_1.4.1/lwip_1.4.1")
list (APPEND PLATFORM_LIBS lwip_1.4.1)
      