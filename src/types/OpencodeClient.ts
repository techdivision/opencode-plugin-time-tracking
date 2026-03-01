/**
 * @fileoverview OpenCode SDK client type.
 */

import type { createOpencodeClient } from "@opencode-ai/sdk"

/**
 * The OpenCode SDK client type.
 *
 * @remarks
 * Derived from the return type of `createOpencodeClient`.
 * Provides access to session, TUI, and other OpenCode APIs.
 */
export type OpencodeClient = ReturnType<typeof createOpencodeClient>
