/**
 * @fileoverview Adapter to convert OpenCode SessionData to lib's SessionDataInterface.
 *
 * This mapper bridges the gap between OpenCode plugin's internal SessionData format
 * and the generic SessionDataInterface expected by lib-ts-time-tracking.
 * It also builds the ConversationContextProvider callback inline with SDK integration.
 */

import type { OpencodeClient } from "../types/OpencodeClient.js"
import type { SessionData } from "../types/SessionData.js"
import type { SessionDataInterface } from "@techdivision/lib-ts-time-tracking"

/**
 * Converts OpenCode plugin's SessionData to lib's SessionDataInterface.
 *
 * @remarks
 * This mapper handles:
 * - Model formatting (provider/modelID)
 * - Token mapping with proper field names
 * - ConversationContextProvider callback building
 * - Graceful degradation if SDK calls fail
 */
export class SessionDataMapper {
  /**
   * Builds SessionDataInterface from SessionData.
   * Includes conversation context provider callback for LLM context.
   *
   * @param session - The OpenCode session data
   * @param client - The OpenCode SDK client for fetching conversation context
   * @param sessionID - The session ID for fetching messages
   * @param config - Configuration including user email and resolved ticket
   * @returns SessionDataInterface ready for TimeTrackingFacade.track()
   *
   * @remarks
   * The conversationContextProvider is built inline and will gracefully
   * degrade if the SDK call fails. The lib's SessionSummaryGenerator
   * will use activity-based fallback in that case.
   *
   * The ticket parameter allows passing a pre-resolved ticket key
   * (from TicketResolver) to ensure the LLM includes it in the description.
   */
  static build(
    session: SessionData,
    client: OpencodeClient,
    sessionID: string,
    config: { userEmail?: string; ticket?: string | null }
  ): SessionDataInterface {
    // Format model as "provider/modelID"
    const modelString = session.model
      ? `${session.model.providerID}/${session.model.modelID}`
      : "unknown"

    // Build conversation context provider inline
    const conversationContextProvider = async (): Promise<string | null> => {
      try {
        const result = await client.session.messages({
          path: { id: sessionID },
        } as Parameters<typeof client.session.messages>[0])

        if (!result?.data || result.data.length === 0) {
          return null
        }

        // Format messages as context string
        return result.data
          .map((m: any) => {
            const role = m.info?.role || "unknown"
            const content = m.content || ""
            return `${role}: ${content}`
          })
          .join("\n")
      } catch {
        // Graceful degradation: if SDK call fails, return null
        // Lib will use activity-based fallback
        return null
      }
    }

    return {
      agent: session.agent?.name ?? "unknown",
      model: modelString,
      startTime: session.startTime,
      endTime: Date.now(),
      userEmail: config.userEmail,
      tokens: {
        input: session.tokenUsage.input,
        output: session.tokenUsage.output,
        cacheRead: session.tokenUsage.cacheRead,
        cacheWrite: session.tokenUsage.cacheWrite,
      },
      activities: session.activities,
      conversationContext: conversationContextProvider,
      ticket: config.ticket ?? session.ticket ?? undefined,
    }
  }
}
