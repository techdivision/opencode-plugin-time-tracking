/**
 * @fileoverview Webhook sender for time tracking entries.
 */

import type { CsvEntryData } from "../types/CsvEntryData"
import type { WriteResult, WriterService } from "../types/WriterService"

import { CsvFormatter } from "../utils/CsvFormatter"

/**
 * Sends time tracking entries to a webhook endpoint.
 *
 * @remarks
 * Implements the WriterService interface to allow seamless integration
 * with other writers (e.g., CsvWriter). Errors are handled internally
 * and returned as part of the WriteResult.
 *
 * Configuration via environment variables:
 * - `TT_WEBHOOK_URL` - The webhook endpoint URL (required for webhook to be active)
 * - `TT_WEBHOOK_BEARER_TOKEN` - Optional Bearer token for authentication
 *
 * If `TT_WEBHOOK_URL` is not set, the webhook is silently skipped (returns success).
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
 * const result = await webhookSender.write(entryData)
 *
 * if (!result.success) {
 *   console.error(`Webhook failed: ${result.error}`)
 * }
 * ```
 */
export class WebhookSender implements WriterService {
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
   * @returns Result indicating success or failure
   *
   * @remarks
   * The payload structure matches the CSV format with all 23 fields.
   * If `TT_WEBHOOK_URL` is not set, returns success (skip is not an error).
   * If `TT_WEBHOOK_BEARER_TOKEN` is set, it's included as Bearer token.
   */
  async write(data: CsvEntryData): Promise<WriteResult> {
    const webhookUrl = process.env.TT_WEBHOOK_URL

    if (!webhookUrl) {
      // Webhook not configured, skip silently (not an error)
      return { writer: "webhook", success: true }
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
      author_email: data.authorEmail,
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

      if (!response.ok) {
        return {
          writer: "webhook",
          success: false,
          error: `HTTP ${response.status}`,
        }
      }

      return { writer: "webhook", success: true }
    } catch (error) {
      return {
        writer: "webhook",
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }
}
