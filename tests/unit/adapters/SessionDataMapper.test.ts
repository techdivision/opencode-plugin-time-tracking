/**
 * @fileoverview Unit tests for SessionDataMapper
 */

import { describe, it, expect, vi } from "vitest"
import { SessionDataMapper } from "../../../src/adapters/SessionDataMapper"
import type { SessionData } from "../../../src/types/SessionData"
import type { OpencodeClient } from "../../../src/types/OpencodeClient"

describe("SessionDataMapper", () => {
  const mockClient = {
    session: {
      messages: vi.fn(),
    },
  } as unknown as OpencodeClient

  const mockSession: SessionData = {
    ticket: "PROJ-123",
    startTime: 1000000,
    activities: [
      {
        type: "tool_call",
        toolName: "edit",
        timestamp: 1000100,
        duration: 500,
      },
    ],
    tokenUsage: {
      input: 100,
      output: 200,
      reasoning: 50,
      cacheRead: 10,
      cacheWrite: 5,
    },
    cost: 0.05,
    model: {
      providerID: "anthropic",
      modelID: "claude-opus-4",
    },
    agent: {
      name: "@developer",
      timestamp: 1000000,
    },
  }

  it("maps SessionData to SessionDataInterface correctly", () => {
    const result = SessionDataMapper.build(mockSession, mockClient, "session-123", {
      userEmail: "user@example.com",
    })

    expect(result.agent).toBe("@developer")
    expect(result.model).toBe("anthropic/claude-opus-4")
    expect(result.startTime).toBe(1000000)
    expect(result.userEmail).toBe("user@example.com")
    expect(result.ticket).toBe("PROJ-123")
    expect(result.tokens.input).toBe(100)
    expect(result.tokens.output).toBe(200)
    expect(result.tokens.cacheRead).toBe(10)
    expect(result.tokens.cacheWrite).toBe(5)
  })

  it("formats model as provider/modelID", () => {
    const result = SessionDataMapper.build(mockSession, mockClient, "session-123", {})

    expect(result.model).toBe("anthropic/claude-opus-4")
  })

  it("handles null model gracefully", () => {
    const sessionWithoutModel: SessionData = {
      ...mockSession,
      model: null,
    }

    const result = SessionDataMapper.build(sessionWithoutModel, mockClient, "session-123", {})

    expect(result.model).toBe("unknown")
  })

  it("handles null agent gracefully", () => {
    const sessionWithoutAgent: SessionData = {
      ...mockSession,
      agent: null,
    }

    const result = SessionDataMapper.build(sessionWithoutAgent, mockClient, "session-123", {})

    expect(result.agent).toBe("unknown")
  })

  it("builds conversationContextProvider callback", async () => {
    const mockMessages = [
      {
        info: { role: "user" },
        content: "Hello",
      },
      {
        info: { role: "assistant" },
        content: "Hi there",
      },
    ]

    vi.mocked(mockClient.session.messages).mockResolvedValueOnce({
      data: mockMessages,
    } as any)

    const result = SessionDataMapper.build(mockSession, mockClient, "session-123", {})

    expect(result.conversationContext).toBeDefined()

    const context = await result.conversationContext!()
    expect(context).toContain("user: Hello")
    expect(context).toContain("assistant: Hi there")
  })

  it("handles SDK call errors gracefully", async () => {
    vi.mocked(mockClient.session.messages).mockRejectedValueOnce(
      new Error("SDK error")
    )

    const result = SessionDataMapper.build(mockSession, mockClient, "session-123", {})

    const context = await result.conversationContext!()
    expect(context).toBeNull()
  })

  it("handles empty messages gracefully", async () => {
    vi.mocked(mockClient.session.messages).mockResolvedValueOnce({
      data: [],
    } as any)

    const result = SessionDataMapper.build(mockSession, mockClient, "session-123", {})

    const context = await result.conversationContext!()
    expect(context).toBeNull()
  })

  it("handles undefined data gracefully", async () => {
    vi.mocked(mockClient.session.messages).mockResolvedValueOnce({
      data: undefined,
    } as any)

    const result = SessionDataMapper.build(mockSession, mockClient, "session-123", {})

    const context = await result.conversationContext!()
    expect(context).toBeNull()
  })

  it("includes activities in result", () => {
    const result = SessionDataMapper.build(mockSession, mockClient, "session-123", {})

    expect(result.activities).toBeDefined()
    expect(result.activities?.length).toBe(1)
    expect(result.activities?.[0].type).toBe("tool_call")
  })

  it("sets endTime to current time", () => {
    const beforeBuild = Date.now()
    const result = SessionDataMapper.build(mockSession, mockClient, "session-123", {})
    const afterBuild = Date.now()

    expect(result.endTime).toBeGreaterThanOrEqual(beforeBuild)
    expect(result.endTime).toBeLessThanOrEqual(afterBuild)
  })
})
