/**
 * @fileoverview Configuration migration utilities for backward compatibility.
 */

import type { SessionSummaryConfigInterface } from "@techdivision/lib-ts-time-tracking"
import type { TimeTrackingJsonConfig } from "../types/TimeTrackingConfig"

/**
 * Resolves the summary configuration with backward compatibility.
 *
 * @remarks
 * Handles migration from deprecated `title_generation` field to new `summary` field.
 * Priority order:
 * 1. `summary` field (new, preferred)
 * 2. `title_generation` field (deprecated, for backward compatibility)
 * 3. `undefined` if neither is present
 *
 * @param config - The time tracking configuration from opencode-project.json
 * @returns The resolved summary configuration, or undefined if not configured
 *
 * @example
 * ```typescript
 * // Old config (still works)
 * const config = { title_generation: { model: "ollama/mistral" } }
 * const summary = resolveSummaryConfig(config)
 * // Returns: { model: "ollama/mistral" }
 *
 * // New config
 * const config = { summary: { model: "ollama/mistral" } }
 * const summary = resolveSummaryConfig(config)
 * // Returns: { model: "ollama/mistral" }
 *
 * // Both present (summary takes precedence)
 * const config = {
 *   summary: { model: "ollama/mistral" },
 *   title_generation: { model: "openai/gpt-4" }
 * }
 * const summary = resolveSummaryConfig(config)
 * // Returns: { model: "ollama/mistral" }
 * ```
 */
export function resolveSummaryConfig(
  config: TimeTrackingJsonConfig
): SessionSummaryConfigInterface | undefined {
  // Prefer new 'summary' field over deprecated 'title_generation'
  let summaryConfig = config.summary || (config as any).title_generation

  if (!summaryConfig) {
    return undefined
  }

  // Check if explicitly disabled
  if (summaryConfig.enabled === false) {
    return undefined
  }

  // Validate required fields for LLM summary generation
  if (!summaryConfig.model || !summaryConfig.api_url) {
    console.warn(
      "[TimeTracking] Summary config incomplete: model and api_url are required for LLM summary generation. Summary generation disabled."
    )
    return undefined
  }

  return summaryConfig
}
