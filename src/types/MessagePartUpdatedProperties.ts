/**
 * @fileoverview Properties for message.part.updated events.
 */

import type { StepFinishPart } from "./StepFinishPart"

/**
 * Properties received with message.part.updated events.
 */
export interface MessagePartUpdatedProperties {
  /** The updated message part */
  part: {
    /** The type of the part (e.g., "step-finish", "agent") */
    type: string

    /** Session ID (present on step-finish and agent parts) */
    sessionID?: string

    /** Cost in USD (present on step-finish parts) */
    cost?: number

    /** Token usage (present on step-finish parts) */
    tokens?: StepFinishPart["tokens"]

    /** Agent name (present on agent parts) */
    name?: string
  }
}
