
#ifndef ENEBULAR_AGENT_INTERFACE_H
#define ENEBULAR_AGENT_INTERFACE_H

#include <limits.h>

class EnebularAgentInterface {

public:

    /**
     * Constructor
     */
    EnebularAgentInterface();

    /**
     * Deconstructor
     */
    ~EnebularAgentInterface();

    /**
     * Connect to the agent.
     */
    bool connect();

    /**
     * Disconnect from the agent.
     */
    void disconnect();

    /**
     * Send a message to the agent.
     *
     * @param type      Message type
     * @param content   Message content
     */
    void send_message(const char *type, const char *content);

    /**
     * Notify the agent of the (connector's) connection state.
     *
     * @param connected Connected or not
     */
    void notify_connection_state(bool connected);

private:

    int _agent_fd;
    char _client_path[PATH_MAX];
    char *_recv_buf;
    int _recv_cnt;
    bool _is_connected;

    bool connect_agent();
    void disconnect_agent();
    bool connected_check();
    bool recv_msg_wait(int timeout_msec);
    bool recv_msg_wait_for_match(const char *match, int timeout_msec);
    bool ok_msg_wait();
    void xfer_msg(const char *msg);

};

#endif // ENEBULAR_AGENT_INTERFACE_H
