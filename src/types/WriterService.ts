/**
 * @fileoverview Interface for time tracking entry writers.
 */

import type { CsvEntryData } from "./CsvEntryData"

/**
 * Interface for services that persist time tracking entries.
 *
 * @remarks
 * Implementations should handle errors internally and not throw.
 * This allows multiple writers to be called in sequence without
 * one failure affecting others.
 *
 * @example
 * ```typescript
 * const writers: WriterService[] = [csvWriter, webhookSender]
 *
 * for (const writer of writers) {
 *   await writer.write(entryData)
 * }
 * ```
 */
export interface WriterService {
  /**
   * Writes a time tracking entry.
   *
   * @param data - The entry data to write (includes id and user_email)
   */
  write(data: CsvEntryData): Promise<void>
}
