/**
 * @fileoverview Message summary type from OpenCode SDK.
 */

/**
 * LLM-generated summary of a message's changes.
 */
export interface MessageSummary {
  /** Short title describing the changes */
  title?: string

  /** Longer description of the changes */
  body?: string
}
