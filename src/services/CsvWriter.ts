/**
 * @fileoverview CSV writer for exporting time tracking data.
 */

import { randomUUID } from "crypto"
import { mkdir } from "fs/promises"
import { dirname } from "path"

import type { CsvEntryData } from "../types/CsvEntryData"
import type { TimeTrackingConfig } from "../types/TimeTrackingConfig"

import { CsvFormatter } from "../utils/CsvFormatter"

import "../types/Bun"

/**
 * CSV header row for the worklog export file.
 * Compatible with Jira/Tempo time tracking import.
 *
 * @remarks
 * Columns 1-17: Original format (v0.5.0 - v0.7.x)
 * Columns 18-23: Extended format (v0.8.0+) with token details and cost
 */
const CSV_HEADER =
  "id,start_date,end_date,user,ticket_name,issue_key,account_key,start_time,end_time,duration_seconds,tokens_used,tokens_remaining,story_points,description,notes,model,agent,tokens_input,tokens_output,tokens_reasoning,tokens_cache_read,tokens_cache_write,cost"

/** Number of columns in the current CSV format */
const CSV_COLUMN_COUNT = 23

/**
 * Checks if a line is a CSV header row.
 *
 * @param line - The line to check
 * @returns `true` if the line appears to be a header
 */
function isHeaderLine(line: string): boolean {
  return line.startsWith('"id"') || line.startsWith("id,")
}

/**
 * Pads a CSV line with empty fields to match the expected column count.
 *
 * @param line - The CSV line to pad
 * @param currentColumns - The current number of columns in the line
 * @param targetColumns - The target number of columns
 * @returns The padded line, or the original line if no padding needed
 */
function padCsvLine(
  line: string,
  currentColumns: number,
  targetColumns: number
): string {
  if (currentColumns >= targetColumns) {
    return line
  }

  const missingColumns = targetColumns - currentColumns
  const padding = ',""\n'.repeat(missingColumns).slice(0, -1) // Remove trailing newline, keep commas
  const emptyFields = Array(missingColumns).fill('""').join(",")

  // Append empty fields to the line
  return line + "," + emptyFields
}

/**
 * Writes time tracking entries to a CSV file.
 *
 * @remarks
 * The CSV format is compatible with Jira/Tempo worklog imports.
 * The file path can be absolute, relative to the project, or use `~/` for home directory.
 */
export class CsvWriter {
  /** Plugin configuration */
  private config: TimeTrackingConfig

  /** Project directory path */
  private directory: string

  /**
   * Creates a new CSV writer instance.
   *
   * @param config - The plugin configuration
   * @param directory - The project directory path
   */
  constructor(config: TimeTrackingConfig, directory: string) {
    this.config = config
    this.directory = directory
  }

  /**
   * Resolves the CSV file path from configuration.
   *
   * @returns The absolute path to the CSV file
   *
   * @remarks
   * Handles three path formats:
   * - `~/path` - Expands to home directory
   * - `/absolute/path` - Used as-is
   * - `relative/path` - Relative to project directory
   */
  private resolvePath(): string {
    let csvPath = this.config.csv_file

    if (csvPath.startsWith("~/")) {
      csvPath = csvPath.replace("~", process.env.HOME || "")
    } else if (!csvPath.startsWith("/")) {
      csvPath = `${this.directory}/${csvPath}`
    }

    return csvPath
  }

  /**
   * Ensures the CSV file exists and has a valid, up-to-date header.
   *
   * @remarks
   * Call this once at plugin startup. Handles these cases:
   * - File doesn't exist: creates it with header
   * - File is empty: writes header
   * - File has data but no header: prepends header and pads rows if needed
   * - File has outdated header (fewer columns): replaces header and pads all rows
   * - File already has current header: no action needed
   *
   * @returns `true` if file was modified, `false` if already valid
   */
  async ensureHeader(): Promise<boolean> {
    const csvPath = this.resolvePath()

    try {
      await mkdir(dirname(csvPath), { recursive: true })
    } catch {
      // Directory may already exist
    }

    const file = Bun.file(csvPath)
    const exists = await file.exists()

    if (!exists) {
      // Create new file with header
      await Bun.write(csvPath, CSV_HEADER + "\n")
      return true
    }

    const content = await file.text()
    const trimmedContent = content.trim()

    if (trimmedContent.length === 0) {
      // Empty file: write header
      await Bun.write(csvPath, CSV_HEADER + "\n")
      return true
    }

    const lines = trimmedContent.split("\n")
    const firstLine = lines[0]
    const hasHeader = isHeaderLine(firstLine)

    // Determine column count from first data line
    const dataLineIndex = hasHeader ? 1 : 0
    if (dataLineIndex >= lines.length) {
      // Only header, no data - ensure header is current
      if (hasHeader && CsvFormatter.countColumns(firstLine) < CSV_COLUMN_COUNT) {
        await Bun.write(csvPath, CSV_HEADER + "\n")
        return true
      }
      return false
    }

    const firstDataLine = lines[dataLineIndex]
    const columnCount = CsvFormatter.countColumns(firstDataLine)

    // Check if migration is needed
    if (columnCount >= CSV_COLUMN_COUNT) {
      // Already has enough columns
      if (!hasHeader) {
        // Just prepend header
        await Bun.write(csvPath, CSV_HEADER + "\n" + trimmedContent + "\n")
        return true
      }
      return false
    }

    // Migration needed: pad all data rows to CSV_COLUMN_COUNT
    const dataLines = hasHeader ? lines.slice(1) : lines
    const paddedLines = dataLines.map((line) => {
      const lineColumnCount = CsvFormatter.countColumns(line)
      return padCsvLine(line, lineColumnCount, CSV_COLUMN_COUNT)
    })

    // Write new header + padded data
    await Bun.write(csvPath, CSV_HEADER + "\n" + paddedLines.join("\n") + "\n")
    return true
  }

  /**
   * Writes a time tracking entry to the CSV file.
   *
   * @param data - The entry data to write
   *
   * @remarks
   * Assumes `ensureHeader()` was called at startup.
   * Simply appends the new entry to the file.
   *
   * @example
   * ```typescript
   * await csvWriter.write({
   *   ticket: "PROJ-123",
   *   startTime: Date.now() - 3600000,
   *   endTime: Date.now(),
   *   durationSeconds: 3600,
   *   description: "Implemented feature X",
   *   notes: "Auto-tracked: read(5x), edit(3x)",
   *   tokenUsage: { input: 1000, output: 500, reasoning: 0, cacheRead: 0, cacheWrite: 0 },
   *   cost: 0.0234
   * })
   * ```
   */
  async write(data: CsvEntryData): Promise<void> {
    const csvPath = this.resolvePath()
    const file = Bun.file(csvPath)
    const exists = await file.exists()

    const totalTokens =
      data.tokenUsage.input + data.tokenUsage.output + data.tokenUsage.reasoning

    const fields = [
      randomUUID(),
      CsvFormatter.formatDate(data.startTime),
      CsvFormatter.formatDate(data.endTime),
      this.config.user_email,
      "",
      data.ticket ?? "",
      data.accountKey,
      CsvFormatter.formatTime(data.startTime),
      CsvFormatter.formatTime(data.endTime),
      data.durationSeconds.toString(),
      totalTokens.toString(),
      "",
      "",
      CsvFormatter.escape(data.description),
      CsvFormatter.escape(data.notes),
      data.model ?? "",
      data.agent ?? "",
      // Extended columns (v0.8.0+)
      data.tokenUsage.input.toString(),
      data.tokenUsage.output.toString(),
      data.tokenUsage.reasoning.toString(),
      data.tokenUsage.cacheRead.toString(),
      data.tokenUsage.cacheWrite.toString(),
      data.cost.toFixed(6),
    ]

    const csvLine = fields.map((f) => `"${f}"`).join(",")

    if (!exists) {
      // Fallback: create file with header if ensureHeader() wasn't called
      await Bun.write(csvPath, CSV_HEADER + "\n" + csvLine + "\n")
    } else {
      const content = await file.text()
      await Bun.write(csvPath, content + csvLine + "\n")
    }
  }
}
