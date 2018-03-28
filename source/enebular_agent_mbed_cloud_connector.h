
#ifndef ENEBULAR_AGENT_MBED_CLOUD_CONNECTOR_H
#define ENEBULAR_AGENT_MBED_CLOUD_CONNECTOR_H

#include "enebular_agent_mbed_cloud_client.h"
#include "enebular_agent_interface.h"
#include "logger.h"

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
     * @param iface A handler to the network interface.
     */
    bool startup(void *iface);

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
     * Kick the connector into running its main loop.
     *
     * This can be called from a separate thread.
     */
    void kick();

    /**
     * Stop the running connector.
     *
     * This can be called from a separate thread or signal handler etc.
     */
    void halt();

    /**
     * Shut down the connector.
     */
    void shutdown();

private:

    Logger *_logger;
    EnebularAgentMbedCloudClient *_mbed_cloud_client;
    EnebularAgentInterface *_agent;
    void *_iface;
    bool _started;
    bool _can_connect;
    volatile bool _running;
    int _epoll_fd;
    int _kick_fd;

    bool init_events();
    void uninit_events();
    void wait_for_events();

    void agent_connection_change_cb();
    void connection_request_cb(bool connect);
    void client_connection_change_cb();
    void agent_manager_message_cb(const char *type, const char *content);

};

#endif // ENEBULAR_AGENT_MBED_CLOUD_CONNECTOR_H
