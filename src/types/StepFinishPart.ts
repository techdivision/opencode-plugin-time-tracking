/**
 * @fileoverview Step finish part type from OpenCode SDK.
 */

/**
 * A step-finish message part containing token usage.
 *
 * @remarks
 * Emitted when a model completes a reasoning step.
 * Contains detailed token consumption statistics.
 */
export interface StepFinishPart {
  /** Part type identifier */
  type: "step-finish"

  /** The session this part belongs to */
  sessionID: string

  /** Cost in USD for this step */
  cost: number

  /** Token usage for this step */
  tokens: {
    /** Input tokens consumed */
    input: number

    /** Output tokens generated */
    output: number

    /** Reasoning tokens used (for o1-style models) */
    reasoning: number

    /** Cache statistics */
    cache: {
      /** Tokens read from cache */
      read: number

      /** Tokens written to cache */
      write: number
    }
  }
}
