/**
 * @fileoverview Extracts conversation context from session messages.
 */

import type { MessageWithParts } from "../types/MessageWithParts"

/**
 * Number of recent conversation turns to extract.
 *
 * @remarks
 * A turn = one user message + the following assistant response.
 */
const RECENT_TURNS = 3

/**
 * Maximum characters for a single assistant response in the context.
 *
 * @remarks
 * Assistant responses can be very long. Truncating keeps the context
 * balanced between user intent and assistant work description.
 */
const MAX_ASSISTANT_CHARS = 500

/**
 * Extracts conversation context from session messages for title generation.
 *
 * @remarks
 * Collects the last {@link RECENT_TURNS} conversation turns (user prompt +
 * first assistant response) to provide meaningful context for worklog
 * description generation.
 */
export class MessageExtractor {
  /**
   * Extracts the last conversation turns from session messages.
   *
   * @param messages - Array of messages with their parts
   * @returns The extracted conversation context, or `null` if no content found
   *
   * @remarks
   * Strategy: Scan from the end to find the last N user messages.
   * For each user message, find the next assistant message that follows it.
   * This gives clean user/assistant pairs regardless of how many
   * intermediate messages exist.
   */
  static extractConversationContext(
    messages: MessageWithParts[]
  ): string | null {
    // Step 1: Find indices of all user messages
    const userIndices: number[] = []
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].info.role === "user") {
        const text = MessageExtractor.extractText(messages[i])
        if (text) {
          userIndices.push(i)
          if (userIndices.length >= RECENT_TURNS) break
        }
      }
    }

    if (userIndices.length === 0) return null

    // Step 2: For each user message, collect it + the first assistant response after it
    const turns: string[] = []

    // Process in chronological order (oldest first)
    for (const idx of userIndices.reverse()) {
      const userText = MessageExtractor.extractText(messages[idx])
      if (userText) {
        turns.push(`User: ${userText}`)
      }

      // Find first assistant response after this user message
      for (let j = idx + 1; j < messages.length; j++) {
        if (messages[j].info.role === "assistant") {
          const assistantText = MessageExtractor.extractText(messages[j])
          if (assistantText) {
            const truncated = assistantText.length > MAX_ASSISTANT_CHARS
              ? assistantText.slice(0, MAX_ASSISTANT_CHARS) + "..."
              : assistantText
            turns.push(`Assistant: ${truncated}`)
            break
          }
        }
        // Stop if we hit the next user message (no assistant response for this turn)
        if (messages[j].info.role === "user") break
      }
    }

    return turns.length > 0 ? turns.join("\n") : null
  }

  /**
   * Extracts non-synthetic text content from a message.
   */
  private static extractText(message: MessageWithParts): string | null {
    const textParts = message.parts
      .filter((part) => part.type === "text" && !part.synthetic && part.text)
      .map((part) => part.text as string)

    if (textParts.length === 0) return null

    const combined = textParts.join("\n").trim()
    return combined.length > 0 ? combined : null
  }
}
