/**
 * @fileoverview Agent information type for tracking which agent executed work.
 */

/**
 * Information about an agent that was active during a session.
 */
export interface AgentInfo {
  /** The agent name (e.g., "@developer", "@reviewer") */
  name: string

  /** Unix timestamp in milliseconds when the agent became active */
  timestamp: number
}
