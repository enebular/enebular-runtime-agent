// ----------------------------------------------------------------------------
// Copyright 2016-2017 ARM Ltd.
//
// SPDX-License-Identifier: Apache-2.0
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
// ----------------------------------------------------------------------------


#ifdef FREERTOS

#include <stdio.h>
#include "setup.h"
#include "lwip/tcpip.h"
#include "lwip/dhcp.h"
#include "ethernetif.h"
#include "ff.h"
#include "diskio.h"
#include "sdhc_config.h"
#include "pin_mux.h"

#define MAX_SD_READ_RETRIES	5
#define configIP_ADDR0 0
#define configIP_ADDR1 0
#define configIP_ADDR2 0
#define configIP_ADDR3 0

/* Netmask configuration. */
#define configNET_MASK0 0
#define configNET_MASK1 0
#define configNET_MASK2 0
#define configNET_MASK3 0

/* Default gateway address configuration */
#define configGW_ADDR0 0
#define configGW_ADDR1 0
#define configGW_ADDR2 0
#define configGW_ADDR3 0

/*! @brief   Debug console baud rate */
#define APP_DEBUG_UART_BAUDRATE 115200

/*! @brief System clock. */
#define APP_DEBUG_UART_CLKSRC_NAME kCLOCK_CoreSysClk

/*! @brief Default partition for SD Card. */
#define DEFAULT_FOLDER_PARTITION         "0:"

/*! @brief File System initialization flag  */
bool fileSystemInit = false;

/*! @brief LWIP network interface structure */
struct netif fsl_netif0;

/*! @brief LWIP IP structure */
ip_addr_t fsl_netif0_ipaddr, fsl_netif0_netmask, fsl_netif0_gw;

/*! @brief is DHCP ready flag  */
volatile bool dhcp_done = false;

/*! @brief FileSystem Mounting point -> "2:/" */
const TCHAR cDriverNumberBuffer[] = {SDDISK + '0', ':', '/'};

/*! @brief Preallocated Work area (file system object) for logical drive, should NOT be free or lost*/
static FATFS fileSystem[2];

/*! @brief Network interface status callback function */
static void netif_status(struct netif *n)
{
    if (n->flags & NETIF_FLAG_UP) {
        printf("Interface is up : %d\r\n", n->dhcp->state);
        printf("IP %s\r\n", ipaddr_ntoa(&n->ip_addr));
        printf("NM %s\r\n", ipaddr_ntoa(&n->netmask));
        printf("GW %s\r\n", ipaddr_ntoa(&n->gw));
        dhcp_done = true;
    } else {
        printf("Interface Down.\n");
    }
}

/*!
 * @brief fileSystemMountDrive - mount the SD card to  "cDriverNumberBuffer"
 * @param void
 * @return void
 */
static void fileSystemMountDrive();

/*!
 * @brief APP_InitPlatformTRNG
 * @param void
 * @return void
 */
static void APP_InitPlatformTRNG();

/*!
 * @brief boardInit - initialized Board H/W
 * @param void
 * @return void
 */
static void boardInit();

/*!
 * @brief Network interface initialization
 * @param *arg - Not in use
 * @return void
 */
void networkInit(void *arg);

/*! \brief blockDelay - Blocks the task and count the number of ticks given
 * @param void
 * \return TRUE - on success
 */
static void blockDelay(uint32_t Ticks);

bool runProgram(main_t mainFunc)
{
    xTaskCreate((TaskFunction_t)mainFunc, "_main_", (uint16_t)1024*15, NULL, tskIDLE_PRIORITY + 1, NULL);

    //Start OS
    vTaskStartScheduler();

    return true;
}

int initFreeRTOSPlatform()
{
    //Init Board
    boardInit();

    //Init FileSystem
    xTaskCreate((TaskFunction_t)fileSystemMountDrive, "FileSystemInit", (uint16_t)1024*4, NULL, tskIDLE_PRIORITY + 3, NULL);

    //Init DHCP thread
    sys_thread_new("networkInit", networkInit, NULL, 1024, tskIDLE_PRIORITY + 2);

    return 0;
}

void networkInit(void *arg)
{
    (void) (arg);
    printf("Starting HTTP thread!\r\n");
    err_t err = 0;
    tcpip_init(NULL, NULL);
    printf("TCP/IP initialized.\r\n");
    IP4_ADDR(&fsl_netif0_ipaddr, configIP_ADDR0, configIP_ADDR1, configIP_ADDR2, configIP_ADDR3);
    IP4_ADDR(&fsl_netif0_netmask, configNET_MASK0, configNET_MASK1, configNET_MASK2, configNET_MASK3);
    IP4_ADDR(&fsl_netif0_gw, configGW_ADDR0, configGW_ADDR1, configGW_ADDR2, configGW_ADDR3);

    netif_add(&fsl_netif0, &fsl_netif0_ipaddr, &fsl_netif0_netmask, &fsl_netif0_gw, NULL, ethernetif_init, tcpip_input);
    netif_set_default(&fsl_netif0);
    netif_set_status_callback(&fsl_netif0, netif_status);

    /* obtain the IP address, default gateway and subnet mask by using DHCP*/
    err = dhcp_start(&fsl_netif0);

    printf("Started DCHP request (%s)\r\n", lwip_strerr(err));
    vTaskDelete(NULL);
}

static void blockDelay(uint32_t Ticks)
{
    uint32_t tickCounts = 0;
    for(tickCounts = 0; tickCounts < Ticks; tickCounts++){}
}

// Currently we support only one interface
void* GetNetWorkInterfaceContext()
{
    return (void *)&fsl_netif0;
}

/*! \brief This function mount the fatfs on and SD card
 * @param void
 */
static void fileSystemMountDrive(void)
{
    printf("Creating FileSystem SetUp thread!\r\n");
    FRESULT fatResult;
    int count = 0;
    if (fileSystemInit == false)
    {
        //Detected SD card inserted
        while (!(GPIO_ReadPinInput(BOARD_SDHC_CD_GPIO_BASE, BOARD_SDHC_CD_GPIO_PIN)))
        {
            blockDelay(1000U);
            if (count++ > MAX_SD_READ_RETRIES)
            {
                break;
            }
        }

        if(count < MAX_SD_READ_RETRIES)
        {
            /* Delay some time to make card stable. */
            blockDelay(10000000U);

            fatResult = f_mount(&fileSystem[0], DEFAULT_FOLDER_PARTITION, 1U);
            if (FR_OK != fatResult)
            {
                printf("Failed to mount partition %s: in disk\r\n", DEFAULT_FOLDER_PARTITION);
            }

            fatResult = f_mount(&fileSystem[1], DEFAULT_FOLDER_PARTITION, 1U);
            if (FR_OK != fatResult)
            {
                printf("Failed to mount partition %s in disk\r\n", DEFAULT_FOLDER_PARTITION);
            }

            if (fatResult == FR_OK)
            {
                fileSystemInit = true;
                printf("Exit FileSystem SetUp thread!\r\n");
            }
        }
    }
    vTaskDelete( NULL );
}

static void APP_InitPlatformTRNG()
{
    CLOCK_EnableClock(kCLOCK_Rnga0);
    CLOCK_DisableClock(kCLOCK_Rnga0);
    CLOCK_EnableClock(kCLOCK_Rnga0);
}

static void boardInit()
{
    MPU_Type *base = MPU;
    BOARD_InitPins();
    BOARD_BootClockRUN();
    BOARD_InitDebugConsole();
    APP_InitPlatformTRNG();
    /* Disable MPU. */
    base->CESR &= ~MPU_CESR_VLD_MASK;
}
#endif // FREERTOS
