/**
 * @fileoverview Configuration type for the time tracking plugin.
 */

import type { AgentDefaultConfig } from "./AgentDefaultConfig"
import type { GlobalDefaultConfig } from "./GlobalDefaultConfig"
import type { SessionSummaryConfigInterface } from "@techdivision/lib-ts-time-tracking"

/**
 * Time tracking configuration as stored in `.opencode/opencode-project.json`.
 *
 * @remarks
 * The `user_email` field is not stored in the JSON file.
 * It is resolved from `OPENCODE_USER_EMAIL` environment variable
 * or falls back to the system username.
 */
export interface TimeTrackingJsonConfig {
  /**
   * Path to the CSV output file.
   *
   * @remarks
   * Supports three formats:
   * - `~/path` - Expands to home directory
   * - `/absolute/path` - Used as-is
   * - `relative/path` - Relative to project directory
   */
  csv_file: string

  /**
   * Global fallback ticket and account configuration.
   *
   * @remarks
   * Required. Contains the default issue_key and account_key used when
   * no ticket is found in context and no agent-specific default is configured.
   */
  global_default: GlobalDefaultConfig

  /**
   * Agent-specific default tickets.
   *
   * @remarks
   * Map of agent names (e.g., "@developer", "@reviewer") to their
   * default ticket configuration. Used when no ticket is found in context.
   */
  agent_defaults?: Record<string, AgentDefaultConfig>

  /**
   * List of agent names to ignore for time tracking.
   *
   * @remarks
   * Sessions triggered by these agents will not be exported to CSV.
   * Agent names should include the "@" prefix (e.g., "@internal").
   */
  ignored_agents?: string[]

  /**
   * Whitelist of valid JIRA project keys.
   *
   * @remarks
   * If set, only tickets from these projects are recognized.
   * If not set, any ticket matching the default pattern is accepted.
   * Project keys should be uppercase with at least 2 letters (e.g., "PROJ", "SOSO").
   */
  valid_projects?: string[]

  /**
   * LLM-based session summary configuration.
   *
   * @remarks
   * Configures automatic generation of worklog descriptions via LLM.
   * This is the new field name (replaces deprecated `title_generation`).
   * Both `summary` and `title_generation` are supported for backward compatibility.
   *
   * @see {@link SessionSummaryConfigInterface} -- Configuration interface from lib
   */
  summary?: SessionSummaryConfigInterface

  /**
   * @deprecated Use `summary` instead. This field is kept for backward compatibility.
   *
   * @remarks
   * Old field name for LLM-based title generation.
   * If both `summary` and `title_generation` are present, `summary` takes precedence.
   */
  title_generation?: SessionSummaryConfigInterface
}

/**
 * Resolved time tracking configuration used at runtime.
 *
 * @remarks
 * Extends `TimeTrackingJsonConfig` with the resolved `user_email` field.
 */
export interface TimeTrackingConfig extends TimeTrackingJsonConfig {
  /**
   * User email for the worklog.
   *
   * @remarks
   * Resolved from (in order of priority):
   * 1. `OPENCODE_USER_EMAIL` environment variable
   * 2. System username (via `os.userInfo().username`)
   */
  user_email: string
}

/**
 * OpenCode project configuration structure.
 */
export interface OpencodeProjectConfig {
  /** JSON Schema reference */
  $schema?: string

  /** Time tracking configuration */
  time_tracking?: TimeTrackingJsonConfig
}
