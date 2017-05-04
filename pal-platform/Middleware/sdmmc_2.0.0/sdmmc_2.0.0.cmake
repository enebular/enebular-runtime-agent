

include_directories(./pal-platform/Middleware/sdmmc_2.0.0/sdmmc_2.0.0/inc)

#add_subdirectory ("./Platform/Middleware/lwip_1.4.1/lwip_1.4.1")
set (EXTRA_CMAKE_DIRS ${EXTRA_CMAKE_DIRS} "./pal-platform/Middleware/sdmmc_2.0.0/sdmmc_2.0.0")
list (APPEND PLATFORM_LIBS sdmmc_2.0.0)
      