
#ifndef ENEBULAR_AGENT_H
#define ENEBULAR_AGENT_H

#ifdef __cplusplus
extern "C" {
#endif

#include <stdbool.h>

/**
 * Initialize the agent (connection).
 *
 * @return 0 on success, < 0 on failure.
 */
int enebular_agent_init(void);

/**
 * Deinitialize the agent (connection).
 */
void enebular_agent_cleanup(void);

/**
 * Send a message to the agent.
 *
 * @param type		Message type
 * @param content	Message content
 * @return 			0 on success, < 0 on failure.
 */
int enebular_agent_send_msg(const char *type, const char *content);

/**
 * Notify the agent of the connection state.
 *
 * @param connected	Connected or not
 * @return 			0 on success, < 0 on failure.
 */
int enebular_agent_notify_conn_state(bool connected);

#ifdef __cplusplus
}
#endif

#endif // ENEBULAR_AGENT_H
