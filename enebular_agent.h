
#ifndef ENEBULAR_AGENT_H
#define ENEBULAR_AGENT_H

#ifdef __cplusplus
extern "C" {
#endif

#include <stdbool.h>

/**
 * //
 * @return
 */
int enebular_agent_init(void);

/**
 * //
 */
void enebular_agent_cleanup(void);

/**
 * //
 * @param type
 * @param content
 * @return
 */
int enebular_agent_send_msg(const char *type, const char *content);

/**
 * //
 * @param connected
 * @return
 */
int enebular_agent_notify_conn_state(bool connected);

#ifdef __cplusplus
}
#endif

#endif // ENEBULAR_AGENT_H
