/**
 * @fileoverview Resolves tickets and account keys with fallback hierarchy.
 */

import type { ResolvedTicketInfo } from "../types/ResolvedTicketInfo"
import type { TimeTrackingConfig } from "../types/TimeTrackingConfig"
import type { TicketExtractor } from "./TicketExtractor"

import { AgentMatcher } from "../utils/AgentMatcher"

/**
 * Resolves tickets and account keys using fallback hierarchy.
 *
 * @remarks
 * Ticket fallback hierarchy:
 * 1. Context ticket (from messages/todos)
 * 2. Direct agent default (from config)
 * 3. Primary agent default (if agent is subagent of a primary agent)
 * 4. Global default (from config)
 * 5. `null` (no ticket found)
 *
 * Account key fallback hierarchy:
 * 1. Direct agent-specific account_key
 * 2. Primary agent's account_key (if agent is subagent)
 * 3. Global default account_key (required)
 *
 * CSV agent name:
 * - If agent is in any `subagents` array, the primary agent name is returned
 * - Otherwise, `null` is returned (caller should use the raw agent name)
 */
export class TicketResolver {
  /** Plugin configuration */
  private config: TimeTrackingConfig

  /** Ticket extractor for context-based lookup */
  private ticketExtractor: TicketExtractor

  /**
   * Creates a new ticket resolver instance.
   *
   * @param config - The plugin configuration
   * @param ticketExtractor - The ticket extractor instance
   */
  constructor(config: TimeTrackingConfig, ticketExtractor: TicketExtractor) {
    this.config = config
    this.ticketExtractor = ticketExtractor
  }

  /**
   * Resolves ticket, account key, and primary agent for a session.
   *
   * @param sessionID - The OpenCode session identifier
   * @param agentName - The agent name (e.g., "@developer"), or `null`
   * @returns Resolved ticket info with ticket, accountKey, and primaryAgent
   *
   * @example
   * ```typescript
   * const resolved = await ticketResolver.resolve("session-123", "@developer")
   * // Returns { ticket: "PROJ-123", accountKey: "TD_DEV", primaryAgent: "@implementation" }
   * ```
   */
  async resolve(
    sessionID: string,
    agentName: string | null
  ): Promise<ResolvedTicketInfo> {
    // Resolve primary agent mapping (for CSV recording)
    const primaryAgentKey = agentName
      ? this.findPrimaryAgentKey(agentName)
      : null

    // 1. Try context ticket
    const contextTicket = await this.ticketExtractor.extract(sessionID)

    if (contextTicket) {
      return {
        ticket: contextTicket,
        accountKey: this.resolveAccountKey(agentName, primaryAgentKey),
        primaryAgent: primaryAgentKey,
      }
    }

    // 2. Try direct agent default
    const directAgentKey = agentName ? this.findDirectAgentKey(agentName) : null

    if (directAgentKey) {
      return {
        ticket: this.config.agent_defaults![directAgentKey].issue_key,
        accountKey: this.resolveAccountKey(directAgentKey, primaryAgentKey),
        primaryAgent: primaryAgentKey,
      }
    }

    // 3. Try primary agent default (if agent is subagent)
    if (primaryAgentKey) {
      return {
        ticket: this.config.agent_defaults![primaryAgentKey].issue_key,
        accountKey: this.resolveAccountKey(null, primaryAgentKey),
        primaryAgent: primaryAgentKey,
      }
    }

    // 4. Try global default
    if (this.config.global_default) {
      return {
        ticket: this.config.global_default.issue_key,
        accountKey: this.resolveAccountKey(agentName, null),
        primaryAgent: primaryAgentKey,
      }
    }

    // 5. No ticket found
    return {
      ticket: null,
      accountKey: this.resolveAccountKey(agentName, null),
      primaryAgent: primaryAgentKey,
    }
  }

  /**
   * Finds a direct matching config key for an agent name.
   *
   * @param agentName - The agent name from the SDK
   * @returns The matching config key, or `null` if not found
   *
   * @remarks
   * Only checks for a direct entry in `agent_defaults` (not subagent arrays).
   * Normalizes both the agent name and config keys to ensure
   * matching works regardless of @ prefix.
   */
  private findDirectAgentKey(agentName: string): string | null {
    const defaults = this.config.agent_defaults

    if (!defaults) {
      return null
    }

    const normalized = AgentMatcher.normalize(agentName)
    const key = Object.keys(defaults).find(
      (k) => AgentMatcher.normalize(k) === normalized
    )

    return key ?? null
  }

  /**
   * Finds the primary agent config key for a given agent name.
   *
   * @param agentName - The agent name to search for in subagent arrays
   * @returns The primary agent's config key, or `null` if not found
   *
   * @remarks
   * Searches all `agent_defaults` entries for a `subagents` array
   * containing the given agent name. Uses normalized comparison
   * (tolerant of @ prefix).
   *
   * @example
   * ```typescript
   * // Config: { "@implementation": { subagents: ["@developer"] } }
   * findPrimaryAgentKey("@developer")  // → "@implementation"
   * findPrimaryAgentKey("developer")   // → "@implementation"
   * findPrimaryAgentKey("@unknown")    // → null
   * ```
   */
  private findPrimaryAgentKey(agentName: string): string | null {
    const defaults = this.config.agent_defaults

    if (!defaults) {
      return null
    }

    const normalized = AgentMatcher.normalize(agentName)

    for (const [key, config] of Object.entries(defaults)) {
      if (!config.subagents) {
        continue
      }

      const found = config.subagents.some(
        (sub) => AgentMatcher.normalize(sub) === normalized
      )

      if (found) {
        return key
      }
    }

    return null
  }

  /**
   * Resolves account key using fallback hierarchy.
   *
   * @param directAgentKey - The direct agent config key, or `null`
   * @param primaryAgentKey - The primary agent config key, or `null`
   * @returns Resolved Tempo account key
   *
   * @remarks
   * Fallback hierarchy:
   * 1. Direct agent's account_key
   * 2. Primary agent's account_key
   * 3. Global default account_key (required)
   */
  private resolveAccountKey(
    directAgentKey: string | null,
    primaryAgentKey: string | null
  ): string {
    // 1. Direct agent-specific account_key
    if (
      directAgentKey &&
      this.config.agent_defaults?.[directAgentKey]?.account_key
    ) {
      return this.config.agent_defaults[directAgentKey].account_key!
    }

    // 2. Primary agent's account_key
    if (
      primaryAgentKey &&
      this.config.agent_defaults?.[primaryAgentKey]?.account_key
    ) {
      return this.config.agent_defaults[primaryAgentKey].account_key!
    }

    // 3. Global default account_key (required)
    return this.config.global_default.account_key
  }
}
