
#include <stdio.h>
#include <stdarg.h>
#include "logger.h"

Logger *Logger::_instance = 0;

const char *log_level_str[] =  {
    [DEBUG] = "debug",
    [INFO]  = "info",
    [ERROR] = "error",
};

Logger* Logger::get_instance()
{
    if (_instance == 0) {
        _instance = new Logger();
    }

    return _instance;
}

Logger::Logger()
{
    _level = INFO;
    _console_enabled = true;
    _agent = 0;
}

void Logger::set_agent_interface(EnebularAgentInterface *agent)
{
    _agent = agent;
}

void Logger::set_level(LogLevel level)
{
    _level = level;
}

void Logger::enable_console(bool enable)
{
    _console_enabled = enable;
}

void Logger::log(LogLevel level, const char *fmt, ...)
{
    if (level > ERROR) {
        return;
    }
    if (level < _level) {
        return;
    }

    int size = 0;
    char *str = NULL;
    va_list ap;

    /* Determine required size */
    va_start(ap, fmt);
    size = vsnprintf(str, size, fmt, ap);
    va_end(ap);
    if (size < 0) {
        return;
    }
    size++; /* For the terminating '\0' */

    str = (char *)malloc(size);
    if (str == NULL) {
        return;
    }
    va_start(ap, fmt);
    size = vsnprintf(str, size, fmt, ap);
    va_end(ap);
    if (size < 0) {
       free(str);
       return;
    }

    if (str[size-1] == '\n') {
        str[size-1] = '\0';
    }

    if (_console_enabled) {
        fprintf((level == ERROR) ? stderr : stdout, "%s\n", str);
    }

    if (_agent && _agent->is_connected()) {
        _agent->send_log_message(log_level_str[level], "Mbed Cloud", str);
    }

    free(str);
}
