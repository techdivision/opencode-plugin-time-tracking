/**
 * @fileoverview Output type for tool.execute.after hook.
 */

/**
 * Output data from the tool.execute.after hook.
 */
export interface ToolExecuteAfterOutput {
  /** Display title for the tool execution */
  title: string

  /** Tool output content */
  output: string

  /** Tool-specific metadata (varies by tool type) */
  metadata: unknown
}
