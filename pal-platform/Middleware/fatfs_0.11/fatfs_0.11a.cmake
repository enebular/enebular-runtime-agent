

include_directories(./pal-platform/Middleware/fatfs_0.11a/fatfs_0.11a/src)	


#add_subdirectory ("./Platform/Middleware/lwip_1.4.1/lwip_1.4.1")
set (EXTRA_CMAKE_DIRS ${EXTRA_CMAKE_DIRS} "./pal-platform/Middleware/fatfs_0.11a/fatfs_0.11a")
list (APPEND PLATFORM_LIBS fatfs_0.11a)
      