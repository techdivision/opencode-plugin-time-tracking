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
 * Extracts text content from an OpenCode message object.
 * Handles the SDK's parts array structure.
 *
 * @param message - The message object from OpenCode SDK
 * @returns The extracted text, or empty string if no text found
 */
function extractTextFromMessage(message: any): string {
  if (!message) return ""
  
  // Try to extract from parts array (main SDK structure)
  if (message.parts && Array.isArray(message.parts)) {
    const textParts = message.parts
      .filter((p: any) => p.type === "text" && !p.synthetic && p.text)
      .map((p: any) => p.text as string)
    if (textParts.length > 0) {
      return textParts.join("\n")
    }
  }
  
  // Fallback to direct content/text fields
  if (message.content && typeof message.content === "string") {
    return message.content
  }
  if (message.text && typeof message.text === "string") {
    return message.text
  }
  
  return ""
}

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
        
        // Use a timeout to avoid hanging the entire session
        const timeoutPromise = new Promise<null>((resolve) => {
          setTimeout(() => {
            resolve(null)
          }, 3000)
        })

        const messagesPromise = client.session.messages({
          path: { id: sessionID },
        } as Parameters<typeof client.session.messages>[0])

        const result = await Promise.race([messagesPromise, timeoutPromise])

        if (!result?.data || result.data.length === 0) {
          return null
        }
        

        // Extract text from messages - only last 3 turns like main-branch MessageExtractor
        const RECENT_TURNS = 3
        const messages = result.data
        
        // Step 1: Find indices of last N user messages
        const userIndices: number[] = []
        for (let i = messages.length - 1; i >= 0; i--) {
          if (messages[i].info?.role === "user") {
            const text = extractTextFromMessage(messages[i])
            if (text) {
              userIndices.push(i)
              if (userIndices.length >= RECENT_TURNS) break
            }
          }
        }

        if (userIndices.length === 0) {
          return null
        }
        

        // Step 2: For each user message, collect it + first assistant response after it
        const turns: string[] = []
        
        // Process in chronological order (oldest first)
        for (const idx of userIndices.reverse()) {
          const userText = extractTextFromMessage(messages[idx])
          if (userText) {
            turns.push(`user: ${userText}`)
          }

          // Find first assistant response after this user message
          for (let j = idx + 1; j < messages.length; j++) {
            if (messages[j].info?.role === "assistant") {
              const assistantText = extractTextFromMessage(messages[j])
              if (assistantText) {
                // Truncate long responses to avoid huge context
                const truncated = assistantText.length > 500
                  ? assistantText.slice(0, 500) + "..."
                  : assistantText
                turns.push(`assistant: ${truncated}`)
                break
              }
            }
            // Stop if we hit next user message
            if (messages[j].info?.role === "user") break
          }
        }

        const result_text = turns.length > 0 ? turns.join("\n") : null
        return result_text
      } catch (e) {
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
