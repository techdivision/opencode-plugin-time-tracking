/**
 * @fileoverview Event hook for session lifecycle and token tracking.
 */

import type { AssistantMessage, Event, Message } from "@opencode-ai/sdk"

import type { CsvWriter } from "../services/CsvWriter"
import type { SessionManager } from "../services/SessionManager"
import type { TicketResolver } from "../services/TicketResolver"
import type { MessagePartUpdatedProperties } from "../types/MessagePartUpdatedProperties"
import type { MessageWithParts } from "../types/MessageWithParts"
import type { OpencodeClient } from "../types/OpencodeClient"
import type { TimeTrackingConfig } from "../types/TimeTrackingConfig"

import { AgentMatcher } from "../utils/AgentMatcher"
import { DescriptionGenerator } from "../utils/DescriptionGenerator"

/**
 * Properties for message.updated events.
 */
interface MessageUpdatedProperties {
  info: Message
}

/**
 * Extracts the summary title from the last user message.
 *
 * @param client - The OpenCode SDK client
 * @param sessionID - The session identifier
 * @returns The summary title, or `null` if not found
 *
 * @internal
 */
async function extractSummaryTitle(
  client: OpencodeClient,
  sessionID: string
): Promise<string | null> {
  try {
    const result = await client.session.messages({
      path: { id: sessionID },
    } as Parameters<typeof client.session.messages>[0])

    if (!result.data) {
      return null
    }

    const messages = result.data as MessageWithParts[]

    // Find the last user message with a summary title
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i]

      if (message.info.role === "user" && message.info.summary?.title) {
        return message.info.summary.title
      }
    }

    return null
  } catch {
    return null
  }
}

/**
 * Creates the event hook for session lifecycle management.
 *
 * @param sessionManager - The session manager instance
 * @param csvWriter - The CSV writer instance
 * @param client - The OpenCode SDK client
 * @returns The event hook function
 *
 * @remarks
 * Handles three types of events:
 *
 * 1. **message.updated** - Tracks model from assistant messages
 * 2. **message.part.updated** - Tracks token usage from step-finish parts
 * 3. **session.idle** - Finalizes and exports the session
 *
 * @example
 * ```typescript
 * const hooks: Hooks = {
 *   event: createEventHook(sessionManager, csvWriter, client),
 * }
 * ```
 */
export function createEventHook(
  sessionManager: SessionManager,
  csvWriter: CsvWriter,
  client: OpencodeClient,
  ticketResolver: TicketResolver,
  config: TimeTrackingConfig
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

    // Handle session idle events (only log on idle, not on deleted)
    if (event.type === "session.idle") {
      const props = event.properties as { sessionID?: string }
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

      const endTime = Date.now()
      const durationSeconds = Math.round((endTime - session.startTime) / 1000)

      // Try to get summary title from messages, fallback to generated description
      const summaryTitle = await extractSummaryTitle(client, sessionID)
      const description =
        summaryTitle || DescriptionGenerator.generate(session.activities)

      const toolSummary = DescriptionGenerator.generateToolSummary(
        session.activities
      )

      const totalTokens =
        session.tokenUsage.input +
        session.tokenUsage.output +
        session.tokenUsage.reasoning

      // Format model as providerID/modelID
      const modelString = session.model
        ? `${session.model.providerID}/${session.model.modelID}`
        : null

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

      try {
        await csvWriter.write({
          ticket: resolved.ticket,
          accountKey: resolved.accountKey,
          startTime: session.startTime,
          endTime,
          durationSeconds,
          description,
          notes: `Auto-tracked: ${toolSummary}`,
          tokenUsage: session.tokenUsage,
          cost: session.cost,
          model: modelString,
          agent: agentString,
        })

        const minutes = Math.round(durationSeconds / 60)

        await client.tui.showToast({
          body: {
            message: `Time tracked: ${minutes} min, ${totalTokens} tokens${resolved.ticket ? ` for ${resolved.ticket}` : ""}`,
            variant: "success",
          },
        })
      } catch {
        await client.tui.showToast({
          body: {
            message: "Time Tracking: Failed to save entry",
            variant: "error",
          },
        })
      }
    }
  }
}
