/**
 * @fileoverview Hook for tracking tool executions.
 */

import type { SessionManager } from "../services/SessionManager"
import type { TicketExtractor } from "../services/TicketExtractor"
import type { ToolExecuteAfterInput } from "../types/ToolExecuteAfterInput"
import type { ToolExecuteAfterOutput } from "../types/ToolExecuteAfterOutput"

/**
 * Creates the tool.execute.after hook for activity tracking.
 *
 * @param sessionManager - The session manager instance
 * @param ticketExtractor - The ticket extractor instance
 * @returns The hook function
 *
 * @remarks
 * This hook is called after every tool execution and:
 *
 * 1. Creates a new session if one doesn't exist
 * 2. Extracts and updates the ticket reference from context
 * 3. Records the tool activity with timestamp and file info
 *
 * @example
 * ```typescript
 * const hooks: Hooks = {
 *   "tool.execute.after": createToolExecuteAfterHook(sessionManager, ticketExtractor),
 * }
 * ```
 */
export function createToolExecuteAfterHook(
  sessionManager: SessionManager,
  ticketExtractor: TicketExtractor
) {
  return async (
    input: ToolExecuteAfterInput,
    output: ToolExecuteAfterOutput
  ): Promise<void> => {
    const { tool, sessionID } = input
    const { title, metadata } = output

    // Create session if it doesn't exist
    if (!sessionManager.has(sessionID)) {
      sessionManager.create(sessionID, null)
    }

    // Extract and update ticket on every tool call
    const ticket = await ticketExtractor.extract(sessionID)
    sessionManager.updateTicket(sessionID, ticket)

    // Extract file info from metadata
    let file: string | undefined

    if (metadata) {
      const meta = metadata as Record<string, unknown>

      file = (meta.filePath || meta.filepath || meta.file) as
        | string
        | undefined

      if (!file && meta.filediff) {
        file = (meta.filediff as Record<string, unknown>).file as
          | string
          | undefined
      }
    }

    if (!file && title) {
      file = title
    }

    sessionManager.addActivity(sessionID, {
      tool,
      timestamp: Date.now(),
      file,
    })
  }
}
