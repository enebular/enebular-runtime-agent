add_definitions("-DFRDM_K64F")
add_definitions ("-DFREEDOM")
SET_COMPILER_DBG_RLZ_FLAG (CMAKE_ASM_FLAGS "-mfpu=fpv4-sp-d16") 
add_definitions ("-DCPU_MK64FN1M0VMD12")
SET_COMPILER_DBG_RLZ_FLAG (CMAKE_C_FLAGS "-mfpu=fpv4-sp-d16")
SET_COMPILER_DBG_RLZ_FLAG (CMAKE_EXE_LINKER_FLAGS "-mfpu=fpv4-sp-d16")

set (PAL_TARGET_DEVICE "MK64F")
set (CPU "cortex-m4")
set (PAL_BOARD_LD_SCRIPT MK64FN1M0xxx12-mbedOS.ld)
set(CMAKE_EXE_LINKER_FLAGS_DEBUG "${CMAKE_EXE_LINKER_FLAGS_DEBUG} -T./pal-platform/Device/K64F/MK64F/${PAL_BOARD_LD_SCRIPT} -static")
set(CMAKE_EXE_LINKER_FLAGS_RELEASE "${CMAKE_EXE_LINKER_FLAGS_RELEASE} -T./pal-platform/Device/K64F/MK64F/${PAL_BOARD_LD_SCRIPT} -static")


include_directories(./pal-platform/Device/K64F/MK64F)
include_directories(./pal-platform/Device/K64F/MK64F/utilities)
include_directories(./pal-platform/Device/K64F/MK64F/drivers)
#  additional directories to look for CMakeLists.txt
set (EXTRA_CMAKE_DIRS ${EXTRA_CMAKE_DIRS} "./pal-platform/Device/K64F/MK64F")
#add_subdirectory ("${PROJECT_SOURCE_DIR}/Non-Dist/Device/${PAL_TARGET_DEVICE}")
list (APPEND PLATFORM_LIBS board)
