/**
 * @fileoverview Integration tests for EventHook with TimeTrackingFacade
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { createEventHook } from "../../../src/hooks/EventHook"
import { SessionManager } from "../../../src/services/SessionManager"
import { TicketResolver } from "../../../src/services/TicketResolver"
import type { TimeTrackingConfig } from "../../../src/types/TimeTrackingConfig"
import type { OpencodeClient } from "../../../src/types/OpencodeClient"
import type { TimeTrackingFacade } from "@techdivision/lib-ts-time-tracking"

describe("EventHook - Time Tracking Integration", () => {
  let sessionManager: SessionManager
  let mockClient: OpencodeClient
  let mockTicketResolver: TicketResolver
  let mockFacade: TimeTrackingFacade
  let config: TimeTrackingConfig

  beforeEach(() => {
    sessionManager = new SessionManager()

    mockClient = {
      tui: {
        showToast: vi.fn().mockResolvedValue(undefined),
      },
      session: {
        messages: vi.fn().mockResolvedValue({ data: [] }),
      },
    } as unknown as OpencodeClient

    mockTicketResolver = {
      resolve: vi.fn().mockResolvedValue({
        ticket: "PROJ-123",
        accountKey: "ACCOUNT-1",
        authorEmail: "author@example.com",
        primaryAgent: "@developer",
      }),
    } as unknown as TicketResolver

    mockFacade = {
      track: vi.fn().mockResolvedValue({
        summary: {
          description: "Test description",
          llmError: null,
        },
        entry: {
          id: "entry-1",
          userEmail: "user@example.com",
          startTime: 1000000,
          endTime: 2000000,
          durationSeconds: 1000,
          description: "Test description",
          notes: "Auto-tracked",
          tokenUsage: {
            input: 100,
            output: 200,
            reasoning: 50,
            cacheRead: 10,
            cacheWrite: 5,
          },
          cost: 0.05,
          model: "anthropic/claude-opus-4",
          agent: "@developer",
        },
        csv: {
          success: true,
          writer: "csv",
        },
        webhook: {
          success: true,
          writer: "webhook",
        },
      }),
    } as unknown as TimeTrackingFacade

    config = {
      csv_file: "~/time.csv",
      global_default: {
        issue_key: "DEFAULT-1",
        account_key: "DEFAULT-ACCOUNT",
        author_email: "default@example.com",
      },
      user_email: "user@example.com",
      time_tracking: {
        defaults: {
          issue_key: "DEFAULT-1",
          account_key: "DEFAULT-ACCOUNT",
          author_email: "default@example.com",
        },
        pricing: {
          default: {
            input: 0.003,
            output: 0.015,
            cache_read: 0.00075,
            cache_write: 0.00375,
          },
          periods: [],
        },
        valid_projects: [],
      },
    } as unknown as TimeTrackingConfig
  })

  it("processes session.status.idle event", async () => {
    const eventHook = createEventHook(
      sessionManager,
      [],
      mockClient,
      mockTicketResolver,
      config,
      async () => mockFacade
    )

    // Create a session
    sessionManager.create("session-1", null)
    sessionManager.addActivity("session-1", {
      type: "tool_call",
      toolName: "edit",
      timestamp: Date.now(),
      duration: 500,
    })
    sessionManager.addTokenUsage("session-1", {
      input: 100,
      output: 200,
      reasoning: 50,
      cacheRead: 10,
      cacheWrite: 5,
    })

    // Trigger idle event
    await eventHook({
      event: {
        type: "session.status",
        properties: {
          sessionID: "session-1",
          status: { type: "idle" },
        },
      } as any,
    })

    // Verify facade was called
    expect(mockFacade.track).toHaveBeenCalled()

    // Verify toast was shown
    expect(mockClient.tui.showToast).toHaveBeenCalled()

    // Verify session was deleted
    expect(sessionManager.has("session-1")).toBe(false)
  })

  it("ignores non-idle status events", async () => {
    const eventHook = createEventHook(
      sessionManager,
      [],
      mockClient,
      mockTicketResolver,
      config,
      async () => mockFacade
    )

    sessionManager.create("session-1", null)

    await eventHook({
      event: {
        type: "session.status",
        properties: {
          sessionID: "session-1",
          status: { type: "busy" },
        },
      } as any,
    })

    // Facade should not be called
    expect(mockFacade.track).not.toHaveBeenCalled()

    // Session should still exist
    expect(sessionManager.has("session-1")).toBe(true)
  })

  it("ignores sessions without activity or tokens", async () => {
    const eventHook = createEventHook(
      sessionManager,
      [],
      mockClient,
      mockTicketResolver,
      config,
      async () => mockFacade
    )

    sessionManager.create("session-1", null)

    await eventHook({
      event: {
        type: "session.status",
        properties: {
          sessionID: "session-1",
          status: { type: "idle" },
        },
      } as any,
    })

    // Facade should not be called
    expect(mockFacade.track).not.toHaveBeenCalled()

    // Toast should not be shown
    expect(mockClient.tui.showToast).not.toHaveBeenCalled()
  })

  it("skips ignored agents", async () => {
    const configWithIgnoredAgent = {
      ...config,
      ignored_agents: ["@internal"],
    }

    const eventHook = createEventHook(
      sessionManager,
      [],
      mockClient,
      mockTicketResolver,
      configWithIgnoredAgent,
      async () => mockFacade
    )

    sessionManager.create("session-1", null)
    sessionManager.setAgent("session-1", "@internal")
    sessionManager.addActivity("session-1", {
      type: "tool_call",
      toolName: "edit",
      timestamp: Date.now(),
      duration: 500,
    })

    await eventHook({
      event: {
        type: "session.status",
        properties: {
          sessionID: "session-1",
          status: { type: "idle" },
        },
      } as any,
    })

    // Facade should not be called
    expect(mockFacade.track).not.toHaveBeenCalled()

    // Toast should show skip message
    expect(mockClient.tui.showToast).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          message: expect.stringContaining("skipped"),
        }),
      })
    )
  })

  it("tracks model from assistant messages", async () => {
    const eventHook = createEventHook(
      sessionManager,
      [],
      mockClient,
      mockTicketResolver,
      config,
      async () => mockFacade
    )

    await eventHook({
      event: {
        type: "message.updated",
        properties: {
          info: {
            role: "assistant",
            sessionID: "session-1",
            modelID: "claude-opus-4",
            providerID: "anthropic",
            mode: "@developer",
          },
        },
      } as any,
    })

    const session = sessionManager.get("session-1")
    expect(session?.model?.modelID).toBe("claude-opus-4")
    expect(session?.model?.providerID).toBe("anthropic")
    expect(session?.agent?.name).toBe("@developer")
  })

  it("tracks token usage from message parts", async () => {
    const eventHook = createEventHook(
      sessionManager,
      [],
      mockClient,
      mockTicketResolver,
      config,
      async () => mockFacade
    )

    sessionManager.create("session-1", null)

    await eventHook({
      event: {
        type: "message.part.updated",
        properties: {
          part: {
            type: "step-finish",
            sessionID: "session-1",
            tokens: {
              input: 100,
              output: 200,
              reasoning: 50,
              cache: {
                read: 10,
                write: 5,
              },
            },
            cost: 0.05,
          },
        },
      } as any,
    })

    const session = sessionManager.get("session-1")
    expect(session?.tokenUsage.input).toBe(100)
    expect(session?.tokenUsage.output).toBe(200)
    expect(session?.tokenUsage.reasoning).toBe(50)
    expect(session?.tokenUsage.cacheRead).toBe(10)
    expect(session?.tokenUsage.cacheWrite).toBe(5)
    expect(session?.cost).toBe(0.05)
  })
})
