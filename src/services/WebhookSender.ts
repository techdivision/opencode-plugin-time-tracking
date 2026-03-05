/**
 * @fileoverview Webhook sender for time tracking entries.
 */

import type { CsvEntryData } from "../types/CsvEntryData"
import type { WriterService } from "../types/WriterService"

import { CsvFormatter } from "../utils/CsvFormatter"

/**
 * Toast handler function type for displaying notifications.
 */
type ToastHandler = (
  message: string,
  variant: "success" | "error" | "info"
) => Promise<void>

/**
 * Sends time tracking entries to a webhook endpoint.
 *
 * @remarks
 * Implements the WriterService interface to allow seamless integration
 * with other writers (e.g., CsvWriter). Errors are handled internally
 * and displayed via toast notifications if a handler is configured.
 *
 * Configuration via environment variables:
 * - `TT_WEBHOOK_URL` - The webhook endpoint URL (required for webhook to be active)
 * - `TT_WEBHOOK_BEARER_TOKEN` - Optional Bearer token for authentication
 *
 * If `TT_WEBHOOK_URL` is not set, the webhook is silently disabled.
 *
 * @example
 * ```typescript
 * // .env
 * TT_WEBHOOK_URL=https://n8n.example.com/webhook/time-tracking
 * TT_WEBHOOK_BEARER_TOKEN=your-secret-token
 * ```
 *
 * @example
 * ```typescript
 * const webhookSender = new WebhookSender()
 * webhookSender.setToastHandler(async (msg, variant) => {
 *   await client.tui.showToast({ body: { message: msg, variant } })
 * })
 *
 * await webhookSender.write(entryData)
 * ```
 */
export class WebhookSender implements WriterService {
  /** Optional toast handler for error notifications */
  private showToast: ToastHandler | null = null

  /**
   * Sets the toast handler for error notifications.
   *
   * @param handler - Function to display toast messages
   */
  setToastHandler(handler: ToastHandler): void {
    this.showToast = handler
  }

  /**
   * Checks if the webhook is configured and enabled.
   *
   * @returns `true` if TT_WEBHOOK_URL is set
   */
  isEnabled(): boolean {
    return !!process.env.TT_WEBHOOK_URL
  }

  /**
   * Sends entry data to the configured webhook.
   *
   * @param data - The entry data to send
   *
   * @remarks
   * The payload structure matches the CSV format with all 23 fields.
   * If `TT_WEBHOOK_URL` is not set, the method returns silently.
   * If `TT_WEBHOOK_BEARER_TOKEN` is set, it's included as Bearer token.
   * Errors are caught and displayed via toast if a handler is configured.
   */
  async write(data: CsvEntryData): Promise<void> {
    const webhookUrl = process.env.TT_WEBHOOK_URL

    if (!webhookUrl) {
      // Webhook not configured, silently skip
      if (this.showToast) {
        await this.showToast("Webhook: TT_WEBHOOK_URL not configured", "info")
      }
      return
    }

    const bearerToken = process.env.TT_WEBHOOK_BEARER_TOKEN

    const totalTokens =
      data.tokenUsage.input + data.tokenUsage.output + data.tokenUsage.reasoning

    const payload = {
      id: data.id,
      start_date: CsvFormatter.formatDate(data.startTime),
      end_date: CsvFormatter.formatDate(data.endTime),
      user: data.userEmail,
      ticket_name: "",
      issue_key: data.ticket ?? "",
      account_key: data.accountKey,
      start_time: CsvFormatter.formatTime(data.startTime),
      end_time: CsvFormatter.formatTime(data.endTime),
      duration_seconds: data.durationSeconds,
      tokens_used: totalTokens,
      tokens_remaining: "",
      story_points: "",
      description: data.description,
      notes: data.notes,
      model: data.model ?? "",
      agent: data.agent ?? "",
      tokens_input: data.tokenUsage.input,
      tokens_output: data.tokenUsage.output,
      tokens_reasoning: data.tokenUsage.reasoning,
      tokens_cache_read: data.tokenUsage.cacheRead,
      tokens_cache_write: data.tokenUsage.cacheWrite,
      cost: data.cost,
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    }

    if (bearerToken) {
      headers["Authorization"] = `Bearer ${bearerToken}`
    }

    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      })

      if (this.showToast) {
        await this.showToast(`Webhook: Sent (${response.status})`, "success")
      }
    } catch {
      if (this.showToast) {
        await this.showToast("Webhook: Failed to send time entry", "error")
      }
    }
  }
}
