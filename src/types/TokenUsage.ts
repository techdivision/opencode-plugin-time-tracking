/**
 * @fileoverview Token usage statistics type.
 */

/**
 * Token consumption statistics for a session.
 */
export interface TokenUsage {
  /** Number of input tokens consumed */
  input: number

  /** Number of output tokens generated */
  output: number

  /** Number of reasoning tokens used (for o1-style models) */
  reasoning: number

  /** Number of tokens read from cache */
  cacheRead: number

  /** Number of tokens written to cache */
  cacheWrite: number
}
