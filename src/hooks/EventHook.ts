/**
 * @fileoverview Event hook for session lifecycle and token tracking.
 */

import { randomUUID } from "crypto"

import type { AssistantMessage, Event, Message } from "@opencode-ai/sdk"

import type { SessionManager } from "../services/SessionManager"
import type { TicketResolver } from "../services/TicketResolver"
import type { TitleGenerator } from "../services/TitleGenerator"
import type { CsvEntryData } from "../types/CsvEntryData"
import type { MessagePartUpdatedProperties } from "../types/MessagePartUpdatedProperties"
import type { MessageWithParts } from "../types/MessageWithParts"
import type { OpencodeClient } from "../types/OpencodeClient"
import type { TimeTrackingConfig } from "../types/TimeTrackingConfig"
import type { WriteResult, WriterService } from "../types/WriterService"

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
 * @param writers - Array of writer services to persist entries (e.g., CsvWriter, WebhookSender)
 * @param client - The OpenCode SDK client
 * @param ticketResolver - The ticket resolver instance
 * @param config - The time tracking configuration
 * @param titleGenerator - The LLM-based title generator instance
 * @returns The event hook function
 *
 * @remarks
 * Handles three types of events:
 *
 * 1. **message.updated** - Tracks model from assistant messages
 * 2. **message.part.updated** - Tracks token usage from step-finish parts
 * 3. **session.status** (idle) - Finalizes and exports the session via all writers
 *
 * Writers are called in order. Each writer handles its own errors internally,
 * so a failure in one writer does not affect others.
 *
 * @example
 * ```typescript
 * const writers: WriterService[] = [csvWriter, webhookSender]
 * const hooks: Hooks = {
 *   event: createEventHook(sessionManager, writers, client, ticketResolver, config, titleGenerator),
 * }
 * ```
 */
export function createEventHook(
  sessionManager: SessionManager,
  writers: WriterService[],
  client: OpencodeClient,
  ticketResolver: TicketResolver,
  config: TimeTrackingConfig,
  titleGenerator: TitleGenerator
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

      const endTime = Date.now()
      const durationSeconds = Math.round((endTime - session.startTime) / 1000)

      // Generate description: LLM title + activity summary
      const activitySummary = DescriptionGenerator.generate(session.activities)

      // Try to get a meaningful title via LLM or OpenCode summary
      let title = await extractSummaryTitle(client, sessionID)

      if (!title) {
        try {
          title = await Promise.race([
            titleGenerator.generate(sessionID),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000)),
          ])
        } catch {
          title = null
        }
      }

      // Combine: "LLM title | activity summary" or just "activity summary"
      const description = title
        ? `${title} | ${activitySummary}`
        : activitySummary

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

      // Build entry data once, shared across all writers
      const entryData: CsvEntryData = {
        id: randomUUID(),
        userEmail: config.user_email,
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
        agent: resolved.primaryAgent ?? agentString,
      }

      // Call all writers in order (CSV first, then webhook, etc.)
      // Collect results for combined status reporting
      const results: WriteResult[] = []
      for (const writer of writers) {
        const result = await writer.write(entryData)
        results.push(result)
      }

      // Build combined toast message with writer status
      const minutes = Math.round(durationSeconds / 60)
      const failedWriters = results.filter((r) => !r.success)

      let message = `Time tracked: ${minutes} min, ${totalTokens} tokens${resolved.ticket ? ` for ${resolved.ticket}` : ""}`

      if (!titleGenerator.isAvailable) {
        message += " (title generation NOT available)"
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
