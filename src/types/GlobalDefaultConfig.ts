/**
 * @fileoverview Global fallback ticket configuration.
 */

/**
 * Configuration for global default ticket fallback.
 *
 * @remarks
 * Used when no ticket is found in session context and no
 * agent-specific default is configured.
 */
export interface GlobalDefaultConfig {
  /**
   * Global default JIRA Issue Key.
   *
   * @remarks
   * Must match pattern `^[A-Z][A-Z0-9]+-[0-9]+$` (e.g., "PROJ-100")
   */
  issue_key: string

  /**
   * Default Tempo Account Key.
   *
   * @remarks
   * Required. Used as the default account for all time entries
   * unless overridden by agent-specific configuration.
   */
  account_key: string

  /**
   * Default Atlassian account email for Tempo worklog attribution.
   *
   * @remarks
   * Determines under whose name the worklog appears in Tempo.
   * If not set, falls back to `config.user_email` (human user books themselves).
   *
   * @example "claude-code@techdivision.com"
   */
  author_email?: string
}
