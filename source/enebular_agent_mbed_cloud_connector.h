
#ifndef ENEBULAR_AGENT_MBED_CLOUD_CONNECTOR_H
#define ENEBULAR_AGENT_MBED_CLOUD_CONNECTOR_H

#include "enebular_agent_mbed_cloud_client.h"
#include "enebular_agent_interface.h"
#include "logger.h"

/**
 * The enebular agent mbed cloud connector.
 *
 * This is the main class responsible for overall control of the connector. It
 * handles of the overall state of the connector and essentially connects the
 * Mbed Cloud client and the enebular agent interface.
 *
 * It implements a very simple (bare minimium) main loop construct for other
 * modules to utilize. It currently has no support for timers (delayed/repeating
 * events).
 */
class EnebularAgentMbedCloudConnector {

public:

    /**
     * Constructor
     */
    EnebularAgentMbedCloudConnector();

    /**
     * Deconstructor
     */
    ~EnebularAgentMbedCloudConnector();

    /**
     * Start up the connector.
     *
     * @param iface A handler to the mbed network interface.
     */
    bool startup(void *iface);

    /**
     * Shut down the connector.
     *
     * This is designed to be run after having the connector exit its main loop
     * with halt().
     */
    void shutdown();

    /**
     * Register a file descriptor to wait on.
     *
     * The connector's main loop will run when the file descriptor is ready to
     * be read.
     * 
     * @param fd File descriptor to wait on.
     */
    void register_wait_fd(int fd);

    /**
     * Deregister a file descriptor that had been registered to wait on.
     *
     * @param fd File descriptor to deregister.
     */
    void deregister_wait_fd(int fd);

    /**
     * Run the connector's main loop.
     *
     * This doesn't return until halt is called. It also waits (sleeps) until
     * either there is activity on the file descriptors registered with
     * register_wait_fd(), or it is kicked with kick().
     */
    void run();

    /**
     * Kick the connector into running a pass of its main loop.
     *
     * This can be called from a separate thread.
     */
    void kick();

    /**
     * Have the connector exit from its main loop.
     *
     * This can be called from a separate thread or signal handler etc.
     */
    void halt();

    /**
     * Set the logger's log level.
     *
     * @param level Log level
     */
    void set_log_level(LogLevel level);

    /**
     * Enable/disable the logger's logging to the console.
     *
     * @param enable Enable/disable
     */
    void enable_log_console(bool enable);

private:

    Logger *_logger;
    EnebularAgentMbedCloudClient *_mbed_cloud_client;
    EnebularAgentInterface *_agent;
    void *_iface;
    bool _started;
    bool _registering;
    bool _can_connect;
    volatile bool _running;
    int _epoll_fd;
    int _kick_fd;

    bool init_wait_events();
    void uninit_wait_events();
    void wait_for_events();

    void update_connection_state();
    void agent_connection_change_cb();
    void registration_request_cb();
    void connection_request_cb(bool connect);
    void client_connection_change_cb();
    void agent_manager_message_cb(const char *type, const char *content);
    void agent_info_cb(const char *type);

};

#endif // ENEBULAR_AGENT_MBED_CLOUD_CONNECTOR_H
