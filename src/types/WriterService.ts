/**
 * @fileoverview Interface for time tracking entry writers.
 */

import type { CsvEntryData } from "./CsvEntryData"

/**
 * Result of a write operation.
 *
 * @remarks
 * Used to report success/failure of individual writers without throwing.
 * Allows callers to aggregate results and display combined status.
 */
export interface WriteResult {
  /** Writer identifier (e.g., "csv", "webhook") */
  writer: string

  /** Whether the write operation succeeded */
  success: boolean

  /** Error message if the operation failed */
  error?: string
}

/**
 * Interface for services that persist time tracking entries.
 *
 * @remarks
 * Implementations should handle errors internally and return a `WriteResult`
 * instead of throwing. This allows multiple writers to be called in sequence
 * without one failure affecting others.
 *
 * @example
 * ```typescript
 * const writers: WriterService[] = [csvWriter, webhookSender]
 * const results: WriteResult[] = []
 *
 * for (const writer of writers) {
 *   const result = await writer.write(entryData)
 *   results.push(result)
 * }
 *
 * const allSucceeded = results.every(r => r.success)
 * ```
 */
export interface WriterService {
  /**
   * Writes a time tracking entry.
   *
   * @param data - The entry data to write (includes id and user_email)
   * @returns Result indicating success or failure with optional error message
   */
  write(data: CsvEntryData): Promise<WriteResult>
}
