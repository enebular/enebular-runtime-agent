
#if 0
#ifndef ENEBULAR_MBED_H
#define ENEBULAR_MBED_H

#include "simplem2mclient.h"

class EnebularMbed {

    SimpleM2MClient * _mbed_client;
    bool _reported_connected;

public:

    EnebularMbed(SimpleM2MClient * mbed_client) :
        _mbed_client(mbed_client),
        _reported_connected(false) {
    }

    bool init(void);

    void deinit(void);

    void tick(void);

};

#endif // ENEBULAR_MBED_H
#endif
