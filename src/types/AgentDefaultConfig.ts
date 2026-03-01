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
}
