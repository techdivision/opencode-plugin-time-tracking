/**
 * @fileoverview OpenCode Time Tracking Plugin
 *
 * Automatically tracks session duration, tool usage, and token consumption,
 * exporting data to CSV for time tracking integration (e.g., Jira/Tempo).
 *
 * @packageDocumentation
 */

import type { Plugin, Hooks, PluginInput } from "@opencode-ai/plugin"
import { TimeTrackingFacade } from "@techdivision/lib-ts-time-tracking"

import { ConfigLoader } from "./services/ConfigLoader"
import { SessionManager } from "./services/SessionManager"
import { TicketExtractor } from "./services/TicketExtractor"
import { TicketResolver } from "./services/TicketResolver"
import { createEventHook } from "./hooks/EventHook"
import { createToolExecuteAfterHook } from "./hooks/ToolExecuteAfterHook"

import type { TimeTrackingConfigInterface } from "@techdivision/lib-ts-time-tracking"

/**
 * Lazy-loads TimeTrackingFacade instance.
 * Follows Marketplace plugin pattern for single initialization.
 *
 * @remarks
 * The facade is initialized once and reused across all event handlers.
 * This ensures consistent state management and efficient resource usage.
 */
let facadePromise: Promise<TimeTrackingFacade> | null = null

async function getTimeTrackingFacade(
  config: TimeTrackingConfigInterface
): Promise<TimeTrackingFacade> {
  if (!facadePromise) {
    facadePromise = Promise.resolve(new TimeTrackingFacade(config))
  }
  return facadePromise
}

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
  const ticketExtractor = new TicketExtractor(client, config.valid_projects)
  const ticketResolver = new TicketResolver(config, ticketExtractor)

  // Writers are now handled by TimeTrackingFacade from lib
  // No need to instantiate CsvWriter and WebhookSender here

  const hooks: Hooks = {
    "tool.execute.after": createToolExecuteAfterHook(
      sessionManager,
      ticketExtractor
    ),
    event: createEventHook(
      sessionManager,
      client,
      ticketResolver,
      config,
      (timeTrackingConfig) => getTimeTrackingFacade(timeTrackingConfig)
    ),
  }

  return hooks
}
