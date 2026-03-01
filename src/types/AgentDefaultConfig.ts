/**
 * @fileoverview Agent-specific default ticket configuration.
 */

/**
 * Configuration for agent-specific default tickets.
 *
 * @remarks
 * Used as fallback when no ticket is found in session context.
 * Each agent (e.g., "@developer", "@reviewer") can have its own default.
 */
export interface AgentDefaultConfig {
  /**
   * Default JIRA Issue Key for this agent.
   *
   * @remarks
   * Must match pattern `^[A-Z][A-Z0-9]+-[0-9]+$` (e.g., "PROJ-123")
   */
  issue_key: string

  /**
   * Optional Tempo Account Key override.
   *
   * @remarks
   * If not set, falls back to `global_default.account_key`
   * or `default_account_key`.
   */
  account_key?: string

  /**
   * Subagents that inherit this agent's issue_key and account_key as fallback.
   *
   * @remarks
   * When a subagent is active:
   * - Its own direct entry (if any) takes priority for ticket/account resolution
   * - Otherwise, this primary agent's issue_key/account_key are used as fallback
   * - The CSV always records this primary agent's name instead of the subagent's name
   *
   * Agent names should include the "@" prefix (e.g., "@developer").
   *
   * @example
   * ```json
   * {
   *   "@implementation": {
   *     "issue_key": "PROJ-DEV",
   *     "account_key": "TD_DEV",
   *     "subagents": ["@developer", "@reviewer", "@tester"]
   *   }
   * }
   * ```
   */
  subagents?: string[]
}
