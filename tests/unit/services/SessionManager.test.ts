/**
 * @fileoverview Unit tests for SessionManager wrapper
 */

import { describe, it, expect } from "vitest"
import { SessionManager } from "../../../src/services/SessionManager"

describe("SessionManager", () => {
  let sessionManager: SessionManager

  beforeEach(() => {
    sessionManager = new SessionManager()
  })

  it("creates a new session", () => {
    const session = sessionManager.create("session-1", "PROJ-123")

    expect(session).toBeDefined()
    expect(session.ticket).toBe("PROJ-123")
    expect(session.startTime).toBeGreaterThan(0)
    expect(session.activities).toEqual([])
    expect(session.tokenUsage.input).toBe(0)
  })

  it("retrieves an existing session", () => {
    sessionManager.create("session-1", "PROJ-123")
    const session = sessionManager.get("session-1")

    expect(session).toBeDefined()
    expect(session?.ticket).toBe("PROJ-123")
  })

  it("returns undefined for non-existent session", () => {
    const session = sessionManager.get("non-existent")

    expect(session).toBeUndefined()
  })

  it("checks if session exists", () => {
    sessionManager.create("session-1", "PROJ-123")

    expect(sessionManager.has("session-1")).toBe(true)
    expect(sessionManager.has("non-existent")).toBe(false)
  })

  it("deletes a session", () => {
    sessionManager.create("session-1", "PROJ-123")
    sessionManager.delete("session-1")

    expect(sessionManager.has("session-1")).toBe(false)
  })

  it("gets and deletes a session atomically", () => {
    sessionManager.create("session-1", "PROJ-123")
    const session = sessionManager.getAndDelete("session-1")

    expect(session).toBeDefined()
    expect(session?.ticket).toBe("PROJ-123")
    expect(sessionManager.has("session-1")).toBe(false)
  })

  it("returns undefined when getting and deleting non-existent session", () => {
    const session = sessionManager.getAndDelete("non-existent")

    expect(session).toBeUndefined()
  })

  it("adds activity to session", () => {
    sessionManager.create("session-1", null)
    sessionManager.addActivity("session-1", {
      type: "tool_call",
      toolName: "edit",
      timestamp: Date.now(),
      duration: 500,
    })

    const session = sessionManager.get("session-1")
    expect(session?.activities.length).toBe(1)
    expect(session?.activities[0].toolName).toBe("edit")
  })

  it("adds token usage to session", () => {
    sessionManager.create("session-1", null)
    sessionManager.addTokenUsage("session-1", {
      input: 100,
      output: 200,
      reasoning: 50,
      cacheRead: 10,
      cacheWrite: 5,
    })

    const session = sessionManager.get("session-1")
    expect(session?.tokenUsage.input).toBe(100)
    expect(session?.tokenUsage.output).toBe(200)
    expect(session?.tokenUsage.reasoning).toBe(50)
    expect(session?.tokenUsage.cacheRead).toBe(10)
    expect(session?.tokenUsage.cacheWrite).toBe(5)
  })

  it("accumulates token usage", () => {
    sessionManager.create("session-1", null)
    sessionManager.addTokenUsage("session-1", {
      input: 100,
      output: 200,
      reasoning: 50,
      cacheRead: 10,
      cacheWrite: 5,
    })
    sessionManager.addTokenUsage("session-1", {
      input: 50,
      output: 100,
      reasoning: 25,
      cacheRead: 5,
      cacheWrite: 2,
    })

    const session = sessionManager.get("session-1")
    expect(session?.tokenUsage.input).toBe(150)
    expect(session?.tokenUsage.output).toBe(300)
    expect(session?.tokenUsage.reasoning).toBe(75)
    expect(session?.tokenUsage.cacheRead).toBe(15)
    expect(session?.tokenUsage.cacheWrite).toBe(7)
  })

  it("adds cost to session", () => {
    sessionManager.create("session-1", null)
    sessionManager.addCost("session-1", 0.05)

    const session = sessionManager.get("session-1")
    expect(session?.cost).toBe(0.05)
  })

  it("accumulates cost", () => {
    sessionManager.create("session-1", null)
    sessionManager.addCost("session-1", 0.05)
    sessionManager.addCost("session-1", 0.03)

    const session = sessionManager.get("session-1")
    expect(session?.cost).toBe(0.08)
  })

  it("updates ticket reference", () => {
    sessionManager.create("session-1", null)
    sessionManager.updateTicket("session-1", "PROJ-456")

    const session = sessionManager.get("session-1")
    expect(session?.ticket).toBe("PROJ-456")
  })

  it("ignores null ticket update", () => {
    sessionManager.create("session-1", "PROJ-123")
    sessionManager.updateTicket("session-1", null)

    const session = sessionManager.get("session-1")
    expect(session?.ticket).toBe("PROJ-123")
  })

  it("sets model on session", () => {
    sessionManager.create("session-1", null)
    sessionManager.setModel("session-1", {
      providerID: "anthropic",
      modelID: "claude-opus-4",
    })

    const session = sessionManager.get("session-1")
    expect(session?.model?.providerID).toBe("anthropic")
    expect(session?.model?.modelID).toBe("claude-opus-4")
  })

  it("only sets model once", () => {
    sessionManager.create("session-1", null)
    sessionManager.setModel("session-1", {
      providerID: "anthropic",
      modelID: "claude-opus-4",
    })
    sessionManager.setModel("session-1", {
      providerID: "openai",
      modelID: "gpt-5",
    })

    const session = sessionManager.get("session-1")
    expect(session?.model?.providerID).toBe("anthropic")
    expect(session?.model?.modelID).toBe("claude-opus-4")
  })

  it("sets agent on session", () => {
    sessionManager.create("session-1", null)
    sessionManager.setAgent("session-1", "@developer")

    const session = sessionManager.get("session-1")
    expect(session?.agent?.name).toBe("@developer")
  })

  it("only sets agent once", () => {
    sessionManager.create("session-1", null)
    sessionManager.setAgent("session-1", "@developer")
    sessionManager.setAgent("session-1", "@reviewer")

    const session = sessionManager.get("session-1")
    expect(session?.agent?.name).toBe("@developer")
  })

  it("handles operations on non-existent session gracefully", () => {
    // Should not throw
    sessionManager.addActivity("non-existent", {
      type: "tool_call",
      toolName: "edit",
      timestamp: Date.now(),
      duration: 500,
    })
    sessionManager.addTokenUsage("non-existent", {
      input: 100,
      output: 200,
      reasoning: 50,
      cacheRead: 10,
      cacheWrite: 5,
    })
    sessionManager.addCost("non-existent", 0.05)
    sessionManager.updateTicket("non-existent", "PROJ-123")
    sessionManager.setModel("non-existent", {
      providerID: "anthropic",
      modelID: "claude-opus-4",
    })
    sessionManager.setAgent("non-existent", "@developer")

    expect(sessionManager.get("non-existent")).toBeUndefined()
  })
})
