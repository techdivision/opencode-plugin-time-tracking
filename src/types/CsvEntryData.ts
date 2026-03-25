/**
 * @fileoverview CSV entry data type for worklog exports.
 */

import type { TokenUsage } from "./TokenUsage"

/**
 * Data structure for a single CSV worklog entry.
 */
export interface CsvEntryData {
  /**
   * Unique identifier for this entry (UUID v4).
   *
   * @remarks
   * Generated once and shared across all WriterService implementations
   * to ensure consistent identification across CSV, webhook, etc.
   */
  id: string

  /**
   * User email for the worklog.
   *
   * @remarks
   * Resolved from (in order of priority):
   * 1. `OPENCODE_USER_EMAIL` environment variable
   * 2. System username (via `os.userInfo().username`)
   */
  userEmail: string

  /** Jira ticket reference (e.g., "PROJ-123"), or `null` if not found */
  ticket: string | null

  /** Session start time as Unix timestamp in milliseconds */
  startTime: number

  /** Session end time as Unix timestamp in milliseconds */
  endTime: number

  /** Duration of the session in seconds */
  durationSeconds: number

  /** Human-readable description of the work performed */
  description: string

  /** Additional notes (e.g., tool usage summary) */
  notes: string

  /** Token consumption statistics */
  tokenUsage: TokenUsage

  /** Total cost in USD */
  cost: number

  /**
   * Model identifier in format `providerID/modelID`.
   *
   * @remarks
   * Examples: `anthropic/claude-opus-4`, `openai/gpt-5`
   */
  model: string | null

  /**
   * Agent name that performed the work.
   *
   * @remarks
   * Examples: `@developer`, `@reviewer`
   * Only the first/primary agent is tracked.
   */
  agent: string | null

  /**
   * Tempo account key for the worklog entry.
   *
   * @remarks
   * Resolved from (in order of priority):
   * 1. Agent-specific account_key
   * 2. Global default account_key
   * 3. default_account_key from config
   */
  accountKey: string

  /**
   * Atlassian account email for Tempo worklog attribution.
   *
   * @remarks
   * Determines under whose name the worklog appears in Tempo.
   * Resolved from (in order of priority):
   * 1. Direct agent's author_email
   * 2. Primary agent's author_email (if agent is subagent)
   * 3. Global default author_email
   * 4. config.user_email (human user books themselves)
   */
  authorEmail: string
}
