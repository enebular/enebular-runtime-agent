//----------------------------------------------------------------------------
// The confidential and proprietary information contained in this file may
// only be used by a person authorised under and to the extent permitted
// by a subsisting licensing agreement from ARM Limited or its affiliates.
//
// (C) COPYRIGHT 2017 ARM Limited or its affiliates.
// ALL RIGHTS RESERVED
//
// This entire notice must be reproduced on all copies of this file
// and copies of this file may only be made by a person if such person is
// permitted to do so under the terms of a subsisting license agreement
// from ARM Limited or its affiliates.
//----------------------------------------------------------------------------

#ifndef APPLICATION_INIT_H
#define APPLICATION_INIT_H

/*
 * application_init() runs the following initializations:
 *  1. trace initialization
 *  2. platform initialization
 *  3. print memory statistics if MBED_HEAP_STATS_ENABLED is defined
 *  4. FCC initialization.
 */
extern bool application_init(void);

#endif //APPLICATION_INIT_H

