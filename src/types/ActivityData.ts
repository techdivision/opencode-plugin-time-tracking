/**
 * @fileoverview Activity data type for tracking tool executions.
 */

/**
 * Represents a single tool activity within a session.
 */
export interface ActivityData {
  /** The name of the tool that was executed (e.g., "read", "edit", "bash") */
  tool: string

  /** Unix timestamp in milliseconds when the activity occurred */
  timestamp: number

  /** Optional file path associated with the activity */
  file?: string
}
