/**
 * @fileoverview Extracts user prompt text from session messages.
 */

import type { MessageWithParts } from "../types/MessageWithParts"

/**
 * Maximum characters to extract from user prompts.
 *
 * @remarks
 * 500 characters is sufficient context for title generation
 * while keeping token usage minimal (~125 tokens).
 */
const MAX_PROMPT_LENGTH = 500

/**
 * Extracts user prompt text from session messages for title generation.
 *
 * @remarks
 * Finds the first user message and extracts non-synthetic text parts.
 * The result is truncated to {@link MAX_PROMPT_LENGTH} characters to
 * minimize token usage in the title generation LLM call.
 */
export class MessageExtractor {
  /**
   * Extracts the first user prompt text from a list of messages.
   *
   * @param messages - Array of messages with their parts
   * @returns The extracted user prompt text, or `null` if no user text found
   *
   * @remarks
   * - Finds the **first** user message (the initial prompt that defines the session)
   * - Filters out synthetic parts (system-injected content like file contents)
   * - Concatenates all text parts with newlines
   * - Truncates to {@link MAX_PROMPT_LENGTH} characters
   *
   * @example
   * ```typescript
   * const prompt = MessageExtractor.extractFirstUserPrompt(messages)
   * // Returns: "Fix the bug in EventHook.ts where session.idle..."
   * ```
   */
  static extractFirstUserPrompt(
    messages: MessageWithParts[]
  ): string | null {
    for (const message of messages) {
      if (message.info.role !== "user") {
        continue
      }

      const textParts = message.parts
        .filter((part) => part.type === "text" && !part.synthetic && part.text)
        .map((part) => part.text as string)

      if (textParts.length === 0) {
        continue
      }

      const combined = textParts.join("\n").trim()

      if (combined.length === 0) {
        continue
      }

      if (combined.length > MAX_PROMPT_LENGTH) {
        return combined.slice(0, MAX_PROMPT_LENGTH)
      }

      return combined
    }

    return null
  }
}
