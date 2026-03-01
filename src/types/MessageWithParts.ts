/**
 * @fileoverview Message with parts type from OpenCode SDK.
 */

import type { MessageInfo } from "./MessageInfo"
import type { MessagePart } from "./MessagePart"

/**
 * A message with its associated parts.
 */
export interface MessageWithParts {
  /** Message metadata */
  info: MessageInfo

  /** Array of message parts (text, tools, files, etc.) */
  parts: MessagePart[]
}
