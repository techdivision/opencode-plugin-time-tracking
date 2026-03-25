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
   * 2. Direct agent default (from config)
   * 3. Primary agent default (if agent is subagent of a primary agent)
   * 4. Global default (from config)
   * 5. `null` (no ticket found)
   */
  ticket: string | null

  /**
   * Resolved Tempo account key.
   *
   * @remarks
   * Resolution priority:
   * 1. Direct agent-specific account_key
   * 2. Primary agent's account_key (if agent is subagent)
   * 3. Global default account_key
   */
  accountKey: string

  /**
   * Resolved Atlassian account email for Tempo worklog attribution.
   *
   * @remarks
   * Resolution priority:
   * 1. Direct agent's author_email
   * 2. Primary agent's author_email (if agent is subagent)
   * 3. Global default author_email
   * 4. config.user_email (human user books themselves)
   */
  authorEmail: string

  /**
   * Primary agent name for CSV recording, or `null` if no mapping exists.
   *
   * @remarks
   * When a subagent is active and mapped to a primary agent via `subagents`,
   * this field contains the primary agent's name (e.g., "@implementation").
   * The CSV should use this name instead of the actual subagent name.
   *
   * `null` if the agent has no primary agent mapping.
   */
  primaryAgent: string | null
}
