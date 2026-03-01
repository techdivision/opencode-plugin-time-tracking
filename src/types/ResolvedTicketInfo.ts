/**
 * @fileoverview Result type for ticket resolution.
 */

/**
 * Result of ticket resolution containing ticket and account key.
 *
 * @remarks
 * Returned by `TicketResolver.resolve()` after applying the
 * fallback hierarchy.
 */
export interface ResolvedTicketInfo {
  /**
   * Resolved JIRA ticket, or `null` if not found.
   *
   * @remarks
   * Resolution priority:
   * 1. Context ticket (from messages/todos)
   * 2. Agent default (from config)
   * 3. Global default (from config)
   * 4. `null` (no ticket found)
   */
  ticket: string | null

  /**
   * Resolved Tempo account key.
   *
   * @remarks
   * Resolution priority:
   * 1. Agent-specific account_key
   * 2. Global default account_key
   * 3. default_account_key from config
   */
  accountKey: string
}
