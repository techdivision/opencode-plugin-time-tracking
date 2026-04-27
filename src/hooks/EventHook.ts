/**
 * @fileoverview Event hook for session lifecycle and token tracking.
 */

import type { AssistantMessage, Event, Message } from "@opencode-ai/sdk"
import type { TimeTrackingFacade, TimeTrackingConfigInterface, WriteResultInterface } from "@techdivision/lib-ts-time-tracking"

import type { SessionManager } from "../services/SessionManager"
import type { TicketResolver } from "../services/TicketResolver"
import type { CsvEntryData } from "../types/CsvEntryData"
import type { MessagePartUpdatedProperties } from "../types/MessagePartUpdatedProperties"
import type { MessageWithParts } from "../types/MessageWithParts"
import type { OpencodeClient } from "../types/OpencodeClient"
import type { TimeTrackingConfig } from "../types/TimeTrackingConfig"

import { AgentMatcher } from "../utils/AgentMatcher"
import { SessionDataMapper } from "../adapters/SessionDataMapper"
import { resolveEnvVarsInObject } from "../utils/EnvResolver"

/**
 * Properties for message.updated events.
 */
interface MessageUpdatedProperties {
  info: Message
}

/**
 * Creates the event hook for session lifecycle management.
 *
 * @param sessionManager - The session manager instance
 * @param client - The OpenCode SDK client
 * @param ticketResolver - The ticket resolver instance
 * @param config - The time tracking configuration
 * @param getTimeTrackingFacade - Function to get the TimeTrackingFacade instance (lazy-loaded)
 * @returns The event hook function
 *
 * @remarks
 * Handles three types of events:
 *
 * 1. **message.updated** - Tracks model from assistant messages
 * 2. **message.part.updated** - Tracks token usage from step-finish parts
 * 3. **session.status** (idle) - Finalizes and exports the session via TimeTrackingFacade
 *
 * The TimeTrackingFacade handles summary generation, CSV writing, and webhook sending.
 * This replaces the previous manual orchestration of TitleGenerator and DescriptionGenerator.
 *
 * @example
 * ```typescript
 * const hooks: Hooks = {
 *   event: createEventHook(sessionManager, client, ticketResolver, config, getFacade),
 * }
 * ```
 */
export function createEventHook(
  sessionManager: SessionManager,
  client: OpencodeClient,
  ticketResolver: TicketResolver,
  config: TimeTrackingConfig,
  getTimeTrackingFacade: (cfg: TimeTrackingConfigInterface) => Promise<TimeTrackingFacade>
) {
  return async ({ event }: { event: Event }): Promise<void> => {
    // Track model and agent from assistant messages
    if (event.type === "message.updated") {
      const props = event.properties as MessageUpdatedProperties
      const message = props.info

      if (message.role === "assistant") {
        const assistantMsg = message as AssistantMessage

        // Ensure session exists for tracking
        if (!sessionManager.has(assistantMsg.sessionID)) {
          sessionManager.create(assistantMsg.sessionID, null)
        }

        // Track model
        if (assistantMsg.modelID && assistantMsg.providerID) {
          sessionManager.setModel(assistantMsg.sessionID, {
            modelID: assistantMsg.modelID,
            providerID: assistantMsg.providerID,
          })
        }

        // Track agent from mode field
        if (assistantMsg.mode) {
          sessionManager.setAgent(assistantMsg.sessionID, assistantMsg.mode)
        }
      }

      return
    }

    // Track token usage from message part events
    if (event.type === "message.part.updated") {
      const props = event.properties as MessagePartUpdatedProperties
      const part = props.part

      // Track token usage from step-finish events
      if (part.type === "step-finish" && part.sessionID && part.tokens) {
        // Ensure session exists for token tracking
        if (!sessionManager.has(part.sessionID)) {
          sessionManager.create(part.sessionID, null)
        }

        sessionManager.addTokenUsage(part.sessionID, {
          input: part.tokens.input,
          output: part.tokens.output,
          reasoning: part.tokens.reasoning,
          cacheRead: part.tokens.cache.read,
          cacheWrite: part.tokens.cache.write,
        })

        // Track cost from step-finish events
        if (part.cost !== undefined) {
          sessionManager.addCost(part.sessionID, part.cost)
        }
      }

      return
    }

    // Handle session status events (only act on idle, not on busy/retry)
    if (event.type === "session.status") {
      const props = event.properties as {
        sessionID?: string
        status?: { type: string }
      }

      // Only process idle status transitions
      if (props.status?.type !== "idle") {
        return
      }

      const sessionID = props.sessionID

      if (!sessionID) {
        return
      }

      // Atomically get and delete to prevent race conditions
      const session = sessionManager.getAndDelete(sessionID)

      // Check if session has any trackable data
      const hasActivity = (session?.activities.length ?? 0) > 0
      const hasTokens =
        (session?.tokenUsage.input ?? 0) +
          (session?.tokenUsage.output ?? 0) >
        0

      if (!session || (!hasActivity && !hasTokens)) {
        return
      }

      // Get agent name if available
      const agentString = session.agent?.name ?? null

      // Check if agent should be ignored (tolerant matching: with or without @ prefix)
      const normalizedAgent = agentString
        ? AgentMatcher.normalize(agentString)
        : null
      const isIgnoredAgent = config.ignored_agents?.some(
        (ignored) => AgentMatcher.normalize(ignored) === normalizedAgent
      )

      if (agentString && isIgnoredAgent) {
        await client.tui.showToast({
          body: {
            message: `Time tracking skipped for ${agentString} (ignored agent)`,
            variant: "info",
          },
        })
        return
      }

      // Resolve ticket and account key with fallback hierarchy
      const resolved = await ticketResolver.resolve(sessionID, agentString)

      // Use TimeTrackingFacade from lib for summary generation and writing
      // This replaces separate TitleGenerator and DescriptionGenerator calls
      const sessionData = SessionDataMapper.build(session, client, sessionID, {
        userEmail: config.user_email,
        ticket: resolved.ticket,
      })

      // Convert plugin's TimeTrackingConfig to lib's TimeTrackingConfigInterface
      // Note: Don't resolve summary config here - let the lib handle both summary and title_generation
      console.log("[EventHook] config object:", JSON.stringify(config, null, 2))

      // Build lib config with pricing from opencode-project.json
      // Fallback to defaults if not configured
      const defaultPricing = {
        default: {
          input: 0.003,
          output: 0.015,
          cache_read: 0.00075,
          cache_write: 0.00375,
        },
        periods: [
          {
            from: "2024-01-01",
            models: {
              "claude-opus": {
                input: 0.015,
                output: 0.075,
                cache_read: 0.00375,
                cache_write: 0.01875,
              },
              "claude-sonnet": {
                input: 0.003,
                output: 0.015,
                cache_read: 0.00075,
                cache_write: 0.00375,
              },
              "claude-haiku": {
                input: 0.00080,
                output: 0.004,
                cache_read: 0.0002,
                cache_write: 0.001,
              },
            },
          },
        ],
      }

      const libConfig: TimeTrackingConfigInterface & { title_generation?: any } = {
        defaults: config.global_default,
        agents: config.agent_defaults,
        csv: { output_path: config.csv_file },
        pricing: (config as any).pricing || defaultPricing,
        valid_projects: config.valid_projects || [],
        // Pass both summary and title_generation to lib - lib will handle the mapping
        // Resolve environment variables in config values (e.g., {env:TT_AGENT_API_KEY})
        ...(config.summary && { summary: resolveEnvVarsInObject(config.summary) }),
        ...((config as any).title_generation && { title_generation: resolveEnvVarsInObject((config as any).title_generation) }),
      }

      console.log("[EventHook] libConfig.summary:", JSON.stringify(libConfig.summary, null, 2))
      console.log("[EventHook] libConfig.title_generation:", JSON.stringify(libConfig.title_generation, null, 2))

      const facade = await getTimeTrackingFacade(libConfig)
      console.log("[EventHook] facade created, calling track()")
      const trackResult = await facade.track(sessionData)
      console.log("[EventHook] trackResult.summary:", JSON.stringify(trackResult.summary, null, 2))
      const description = trackResult.summary.description

      // Build entry data from trackResult.entry (CSV entry comes directly from Lib!)
      const entryData: CsvEntryData = {
        ...trackResult.entry,
        ticket: resolved.ticket, // OpenCode Resolving override
        accountKey: resolved.accountKey,
        authorEmail: resolved.authorEmail, // OpenCode Resolving override
        agent: (resolved.primaryAgent ?? agentString)?.replace(/^@/, "") ?? null,
      }

      // Writers are called by Facade, but we have access to results
      const results: WriteResultInterface[] = [
        trackResult.csv,
        trackResult.webhook,
      ].filter((r) => r !== undefined && r !== null) as WriteResultInterface[]

      // Build combined toast message with writer status
      const durationSeconds = Math.round((Date.now() - session.startTime) / 1000)
      const minutes = Math.round(durationSeconds / 60)
      const totalTokens =
        (session.tokenUsage.input ?? 0) +
        (session.tokenUsage.output ?? 0) +
        (session.tokenUsage.reasoning ?? 0)
      const failedWriters = results.filter((r) => !r.success)

      let message = `Time tracked: ${minutes} min, ${totalTokens} tokens${resolved.ticket ? ` for ${resolved.ticket}` : ""}`

      if (trackResult.summary.llmError) {
        message += ` (LLM: ${trackResult.summary.llmError})`
      }

      if (failedWriters.length > 0) {
        const failedNames = failedWriters.map((r) => r.writer).join(", ")
        message += ` (${failedNames}: failed)`
      }

      await client.tui.showToast({
        body: {
          message,
          variant: failedWriters.length > 0 ? "warning" : "success",
        },
      })
    }
  }
}
