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
   * Must match pattern `^[A-Z][A-Z0-9]+-[0-9]+$` (e.g., "PROJ-MISC-001")
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
}
