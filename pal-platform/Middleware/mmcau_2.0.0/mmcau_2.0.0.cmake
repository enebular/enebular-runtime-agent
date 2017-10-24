
#  additional directories to look for CMakeLists.txt
include_directories(./pal-platform/Middleware/mmcau_2.0.0/mmcau_2.0.0) 

set (EXTRA_CMAKE_DIRS ${EXTRA_CMAKE_DIRS} "./pal-platform/Middleware/mmcau_2.0.0/mmcau_2.0.0")
list (APPEND PLATFORM_LIBS mmcau_2.0.0)
      