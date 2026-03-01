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
 * 2. Agent default (from config)
 * 3. Global default (from config)
 * 4. `null` (no ticket found)
 *
 * Account key fallback hierarchy:
 * 1. Agent-specific account_key
 * 2. Global default account_key (required)
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
   * Resolves ticket and account key for a session.
   *
   * @param sessionID - The OpenCode session identifier
   * @param agentName - The agent name (e.g., "@developer"), or `null`
   * @returns Resolved ticket info with ticket and accountKey
   *
   * @example
   * ```typescript
   * const resolved = await ticketResolver.resolve("session-123", "@developer")
   * // Returns { ticket: "PROJ-123", accountKey: "TD_DEV" }
   * ```
   */
  async resolve(
    sessionID: string,
    agentName: string | null
  ): Promise<ResolvedTicketInfo> {
    // 1. Try context ticket
    const contextTicket = await this.ticketExtractor.extract(sessionID)

    if (contextTicket) {
      return {
        ticket: contextTicket,
        accountKey: this.resolveAccountKey(agentName),
      }
    }

    // 2. Try agent default (tolerant matching: with or without @ prefix)
    const agentKey = agentName ? this.findAgentKey(agentName) : null

    if (agentKey) {
      return {
        ticket: this.config.agent_defaults![agentKey].issue_key,
        accountKey: this.resolveAccountKey(agentKey),
      }
    }

    // 3. Try global default
    if (this.config.global_default) {
      return {
        ticket: this.config.global_default.issue_key,
        accountKey: this.resolveAccountKey(agentName),
      }
    }

    // 4. No ticket found
    return {
      ticket: null,
      accountKey: this.resolveAccountKey(agentName),
    }
  }

  /**
   * Finds the matching config key for an agent name.
   *
   * @param agentName - The agent name from the SDK
   * @returns The matching config key, or `null` if not found
   *
   * @remarks
   * Normalizes both the agent name and config keys to ensure
   * matching works regardless of @ prefix.
   */
  private findAgentKey(agentName: string): string | null {
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
   * Resolves account key using fallback hierarchy.
   *
   * @param agentKey - The agent config key, or `null`
   * @returns Resolved Tempo account key
   */
  private resolveAccountKey(agentKey: string | null): string {
    // 1. Agent-specific account_key
    if (agentKey && this.config.agent_defaults?.[agentKey]?.account_key) {
      return this.config.agent_defaults[agentKey].account_key!
    }

    // 2. Global default account_key (required)
    return this.config.global_default.account_key
  }
}
