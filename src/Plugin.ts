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
import { TitleGenerator } from "./services/TitleGenerator"
import { WebhookSender } from "./services/WebhookSender"
import { createEventHook } from "./hooks/EventHook"
import { createToolExecuteAfterHook } from "./hooks/ToolExecuteAfterHook"

import type { WriterService } from "./types/WriterService"

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
  const webhookSender = new WebhookSender()
  const ticketExtractor = new TicketExtractor(client, config.valid_projects)
  const ticketResolver = new TicketResolver(config, ticketExtractor)
  const configDir = `${directory}/.opencode`
  const titleGenerator = new TitleGenerator(client, config, configDir)

  // Check API reachability in background (never blocks plugin startup)
  titleGenerator.checkAvailability().then(() => {
    if (!titleGenerator.isAvailable) {
      client.tui.showToast({
        body: {
          message: `Title generation: ${titleGenerator.unavailableInfo}`,
          variant: "warning",
        },
      }).catch(() => {})
    }
  }).catch(() => {})

  // Writers are called in order: CSV first (backup), then webhook
  const writers: WriterService[] = [csvWriter, webhookSender]

  // Ensure CSV file has a valid header at startup
  await csvWriter.ensureHeader()

  const hooks: Hooks = {
    "tool.execute.after": createToolExecuteAfterHook(
      sessionManager,
      ticketExtractor
    ),
    event: createEventHook(sessionManager, writers, client, ticketResolver, config, titleGenerator),
  }

  return hooks
}
