/**
 * @fileoverview Utility for normalizing agent names.
 */

/**
 * Normalizes agent names to a canonical form.
 *
 * @remarks
 * Agent names can appear with or without the "@" prefix
 * depending on the source (SDK, config, user input).
 * This class ensures consistent comparison by normalizing
 * all agent names to the "@<name>" format.
 */
export class AgentMatcher {
  /**
   * Normalizes an agent name to canonical form (with @ prefix).
   *
   * @param agentName - The agent name to normalize
   * @returns The normalized agent name with @ prefix
   *
   * @example
   * ```typescript
   * AgentMatcher.normalize("developer")      // → "@developer"
   * AgentMatcher.normalize("@developer")     // → "@developer"
   * AgentMatcher.normalize("@time-tracking") // → "@time-tracking"
   * ```
   */
  static normalize(agentName: string): string {
    return agentName.startsWith("@") ? agentName : `@${agentName}`
  }
}
