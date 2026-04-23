/**
 * @fileoverview Session state management for time tracking.
 *
 * This is a wrapper around the generic OpenCodeSessionManager from lib-ts-time-tracking.
 * It provides OpenCode-specific facade to the generic library implementation.
 */

import { OpenCodeSessionManager } from "@techdivision/lib-ts-time-tracking"

import type { ActivityData } from "../types/ActivityData"
import type { AgentInfo } from "../types/AgentInfo"
import type { ModelInfo } from "../types/ModelInfo"
import type { SessionData } from "../types/SessionData"
import type { TokenUsage } from "../types/TokenUsage"

/**
 * Wrapper around OpenCodeSessionManager from lib.
 *
 * Provides OpenCode-specific facade to the generic library implementation.
 * All state management is delegated to the library to ensure single source of truth.
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
  /** Delegate to lib's generic session manager */
  private manager = new OpenCodeSessionManager()

  /**
   * Retrieves session data by ID.
   *
   * @param sessionID - The OpenCode session identifier
   * @returns The session data, or `undefined` if not found
   */
  get(sessionID: string): SessionData | undefined {
    return this.manager.get(sessionID) as SessionData | undefined
  }

  /**
   * Checks if a session exists.
   *
   * @param sessionID - The OpenCode session identifier
   * @returns `true` if the session exists, `false` otherwise
   */
  has(sessionID: string): boolean {
    return this.manager.has(sessionID)
  }

  /**
   * Creates a new session.
   *
   * @param sessionID - The OpenCode session identifier
   * @param ticket - Optional Jira ticket reference (e.g., "PROJ-123")
   * @returns The newly created session data
   */
  create(sessionID: string, ticket: string | null): SessionData {
    return this.manager.create(sessionID, ticket) as SessionData
  }

  /**
   * Deletes a session.
   *
   * @param sessionID - The OpenCode session identifier
   */
  delete(sessionID: string): void {
    this.manager.delete(sessionID)
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
    return this.manager.getAndDelete(sessionID) as SessionData | undefined
  }

  /**
   * Adds a tool activity to a session.
   *
   * @param sessionID - The OpenCode session identifier
   * @param activity - The activity data to add
   */
  addActivity(sessionID: string, activity: ActivityData): void {
    this.manager.addActivity(sessionID, activity)
  }

  /**
   * Adds token usage to a session's cumulative totals.
   *
   * @param sessionID - The OpenCode session identifier
   * @param tokens - The token usage to add
   */
  addTokenUsage(sessionID: string, tokens: TokenUsage): void {
    this.manager.addTokenUsage(sessionID, {
      input: tokens.input,
      output: tokens.output,
      reasoning: tokens.reasoning,
      cacheRead: tokens.cacheRead,
      cacheWrite: tokens.cacheWrite,
    })
  }

  /**
   * Adds cost to a session's cumulative total.
   *
   * @param sessionID - The OpenCode session identifier
   * @param cost - The cost in USD to add
   */
  addCost(sessionID: string, cost: number): void {
    this.manager.addCost(sessionID, cost)
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
    this.manager.updateTicket(sessionID, ticket)
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
    this.manager.setModel(sessionID, {
      providerID: model.providerID,
      modelID: model.modelID,
    })
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
    this.manager.setAgent(sessionID, agentName)
  }
}
