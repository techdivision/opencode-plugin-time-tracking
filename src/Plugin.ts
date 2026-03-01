/**
 * @fileoverview OpenCode Time Tracking Plugin
 *
 * Automatically tracks session duration, tool usage, and token consumption,
 * exporting data to CSV for time tracking integration (e.g., Jira/Tempo).
 *
 * @packageDocumentation
 */

import type { Plugin, Hooks, PluginInput } from "@opencode-ai/plugin"

import { ConfigLoader } from "./services/ConfigLoader"
import { CsvWriter } from "./services/CsvWriter"
import { SessionManager } from "./services/SessionManager"
import { TicketExtractor } from "./services/TicketExtractor"
import { TicketResolver } from "./services/TicketResolver"
import { createEventHook } from "./hooks/EventHook"
import { createToolExecuteAfterHook } from "./hooks/ToolExecuteAfterHook"

/**
 * OpenCode Time Tracking Plugin
 *
 * This plugin automatically tracks:
 * - Session duration (start/end time)
 * - Tool usage (which tools were called)
 * - Token consumption (input/output/reasoning tokens)
 * - Ticket references (extracted from user messages or todos)
 *
 * Data is exported to a CSV file configured in `.opencode/opencode-project.json`.
 *
 * @param input - Plugin input containing client, directory, and other context
 * @returns Hooks object with event and tool.execute.after handlers
 *
 * @example
 * ```json
 * // .opencode/opencode-project.json
 * {
 *   "time_tracking": {
 *     "csv_file": "~/worklogs/time.csv",
 *     "default_account_key": "ACCOUNT-1"
 *   }
 * }
 * ```
 *
 * @example
 * ```bash
 * # .env - Set user email via environment variable
 * OPENCODE_USER_EMAIL=user@example.com
 * ```
 */
export const plugin: Plugin = async ({
  client,
  directory,
}: PluginInput): Promise<Hooks> => {
  const config = await ConfigLoader.load(directory)

  if (!config) {
    // Silently return empty hooks if no config found
    return {}
  }

  const sessionManager = new SessionManager()
  const csvWriter = new CsvWriter(config, directory)
  const ticketExtractor = new TicketExtractor(client, config.valid_projects)
  const ticketResolver = new TicketResolver(config, ticketExtractor)

  // Ensure CSV file has a valid header at startup
  await csvWriter.ensureHeader()

  const hooks: Hooks = {
    "tool.execute.after": createToolExecuteAfterHook(
      sessionManager,
      ticketExtractor
    ),
    event: createEventHook(sessionManager, csvWriter, client, ticketResolver, config),
  }

  return hooks
}
