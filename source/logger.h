
#ifndef LOGGER_H
#define LOGGER_H

#include "enebular_agent_interface.h"

enum LogLevel {
    DEBUG   = 0,
    INFO    = 1,
    ERROR   = 2
};

class Logger {

public:

    static Logger *get_instance();

    void set_agent_interface(EnebularAgentInterface *agent);

    void set_level(LogLevel level);

    void enable_console(bool enable);

    void log(LogLevel level, const char *fmt, ...);

private:

    static Logger *_instance;
    LogLevel _level;
    bool _console_enabled;
    EnebularAgentInterface *_agent;

    Logger();

};

#endif // LOGGER_H
