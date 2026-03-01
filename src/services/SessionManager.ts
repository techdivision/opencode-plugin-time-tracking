/**
 * @fileoverview Session state management for time tracking.
 */

import type { ActivityData } from "../types/ActivityData"
import type { AgentInfo } from "../types/AgentInfo"
import type { ModelInfo } from "../types/ModelInfo"
import type { SessionData } from "../types/SessionData"
import type { TokenUsage } from "../types/TokenUsage"

/**
 * Manages active session state for time tracking.
 *
 * @remarks
 * Each OpenCode session is tracked separately with its own:
 * - Start time
 * - Ticket reference
 * - Tool activities
 * - Token usage statistics
 *
 * Sessions are stored in memory and cleaned up when completed.
 */
export class SessionManager {
  /** Map of session ID to session data */
  private sessions = new Map<string, SessionData>()

  /**
   * Retrieves session data by ID.
   *
   * @param sessionID - The OpenCode session identifier
   * @returns The session data, or `undefined` if not found
   */
  get(sessionID: string): SessionData | undefined {
    return this.sessions.get(sessionID)
  }

  /**
   * Checks if a session exists.
   *
   * @param sessionID - The OpenCode session identifier
   * @returns `true` if the session exists, `false` otherwise
   */
  has(sessionID: string): boolean {
    return this.sessions.has(sessionID)
  }

  /**
   * Creates a new session.
   *
   * @param sessionID - The OpenCode session identifier
   * @param ticket - Optional Jira ticket reference (e.g., "PROJ-123")
   * @returns The newly created session data
   */
  create(sessionID: string, ticket: string | null): SessionData {
    const session: SessionData = {
      ticket,
      startTime: Date.now(),
      activities: [],
      tokenUsage: {
        input: 0,
        output: 0,
        reasoning: 0,
        cacheRead: 0,
        cacheWrite: 0,
      },
      cost: 0,
      model: null,
      agent: null,
    }

    this.sessions.set(sessionID, session)

    return session
  }

  /**
   * Deletes a session.
   *
   * @param sessionID - The OpenCode session identifier
   */
  delete(sessionID: string): void {
    this.sessions.delete(sessionID)
  }

  /**
   * Retrieves and deletes a session atomically.
   *
   * @param sessionID - The OpenCode session identifier
   * @returns The session data, or `undefined` if not found
   *
   * @remarks
   * Prevents race conditions when multiple idle events fire
   * for the same session. The session is removed immediately
   * after retrieval to ensure it can only be processed once.
   */
  getAndDelete(sessionID: string): SessionData | undefined {
    const session = this.sessions.get(sessionID)

    if (session) {
      this.sessions.delete(sessionID)
    }

    return session
  }

  /**
   * Adds a tool activity to a session.
   *
   * @param sessionID - The OpenCode session identifier
   * @param activity - The activity data to add
   */
  addActivity(sessionID: string, activity: ActivityData): void {
    const session = this.sessions.get(sessionID)

    if (session) {
      session.activities.push(activity)
    }
  }

  /**
   * Adds token usage to a session's cumulative totals.
   *
   * @param sessionID - The OpenCode session identifier
   * @param tokens - The token usage to add
   */
  addTokenUsage(sessionID: string, tokens: TokenUsage): void {
    const session = this.sessions.get(sessionID)

    if (session) {
      session.tokenUsage.input += tokens.input
      session.tokenUsage.output += tokens.output
      session.tokenUsage.reasoning += tokens.reasoning
      session.tokenUsage.cacheRead += tokens.cacheRead
      session.tokenUsage.cacheWrite += tokens.cacheWrite
    }
  }

  /**
   * Adds cost to a session's cumulative total.
   *
   * @param sessionID - The OpenCode session identifier
   * @param cost - The cost in USD to add
   */
  addCost(sessionID: string, cost: number): void {
    const session = this.sessions.get(sessionID)

    if (session) {
      session.cost += cost
    }
  }

  /**
   * Updates the ticket reference for a session.
   *
   * @param sessionID - The OpenCode session identifier
   * @param ticket - The new ticket reference, or `null` to keep existing
   *
   * @remarks
   * Only updates if a non-null ticket is provided.
   * This allows the ticket to be updated when found in later messages.
   */
  updateTicket(sessionID: string, ticket: string | null): void {
    const session = this.sessions.get(sessionID)

    if (session && ticket) {
      session.ticket = ticket
    }
  }

  /**
   * Sets the model for a session.
   *
   * @param sessionID - The OpenCode session identifier
   * @param model - The model information
   *
   * @remarks
   * Only sets the model if it hasn't been set yet.
   * The first model detected in a session is used.
   */
  setModel(sessionID: string, model: ModelInfo): void {
    const session = this.sessions.get(sessionID)

    if (session && !session.model) {
      session.model = model
    }
  }

  /**
   * Sets the agent for a session.
   *
   * @param sessionID - The OpenCode session identifier
   * @param agentName - The agent name (e.g., "@developer")
   *
   * @remarks
   * Only sets the agent if it hasn't been set yet.
   * The first agent detected in a session is used (primary agent).
   */
  setAgent(sessionID: string, agentName: string): void {
    const session = this.sessions.get(sessionID)

    if (session && !session.agent) {
      const agent: AgentInfo = {
        name: agentName,
        timestamp: Date.now(),
      }
      session.agent = agent
    }
  }
}
