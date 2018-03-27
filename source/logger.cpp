
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
    pthread_mutex_init(&_lock, NULL);
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

void Logger::out_console(LogLevel level, const char *msg)
{
    pthread_mutex_lock(&_lock);

    if (_console_enabled) {
        fprintf((level == ERROR) ? stderr : stdout, "%s\n", msg);
    }

    pthread_mutex_unlock(&_lock);
}

void Logger::out_agent(LogLevel level, const char *msg)
{
    if (_agent && _agent->is_connected()) {
        _agent->send_log_message(log_level_str[level], "Mbed Cloud", msg);
    }
}

#define MAX_MSG_SIZE (1024*4)

void Logger::log(LogLevel level, const char *fmt, ...)
{
    if (level > ERROR) {
        return;
    }
    if (level < _level) {
        return;
    }

    char *str = (char *)malloc(MAX_MSG_SIZE);
    if (str == NULL) {
        return;
    }

    va_list ap;
    va_start(ap, fmt);
    int size = vsnprintf(str, MAX_MSG_SIZE-1, fmt, ap);
    va_end(ap);
    if (size < 0) {
       free(str);
       return;
    }
    if (str[size-1] == '\n') {
        str[size-1] = '\0';
    }

    out_console(level, str);
    out_agent(level, str);

    free(str);
}

void Logger::log_console(LogLevel level, const char *fmt, ...)
{
    if (level > ERROR) {
        return;
    }
    if (level < _level) {
        return;
    }

    char *str = (char *)malloc(MAX_MSG_SIZE);
    if (str == NULL) {
        return;
    }

    va_list ap;
    va_start(ap, fmt);
    int size = vsnprintf(str, MAX_MSG_SIZE-1, fmt, ap);
    va_end(ap);
    if (size < 0) {
       free(str);
       return;
    }
    if (str[size-1] == '\n') {
        str[size-1] = '\0';
    }

    out_console(level, str);

    free(str);
}
