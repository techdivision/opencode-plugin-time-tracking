/**
 * @fileoverview Input type for tool.execute.after hook.
 */

/**
 * Input received by the tool.execute.after hook.
 */
export interface ToolExecuteAfterInput {
  /** Name of the tool that was executed */
  tool: string

  /** The OpenCode session identifier */
  sessionID: string

  /** Unique identifier for this tool call */
  callID: string
}
