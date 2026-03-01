import { tool } from "@opencode-ai/plugin"
import fs from "fs"
import path from "path"
import os from "os"

interface TimeTrackingConfig {
  csv_file: string
  default_account_key: string
}

interface ProjectConfig {
  time_tracking?: TimeTrackingConfig
}

interface TicketSummary {
  issue_key: string
  account_key: string
  first_activity: string
  total_duration_seconds: number
  total_tokens: number
  entry_count: number
  descriptions: string[]
}

interface CumulationResult {
  date: string
  csv_file: string
  ticket_count: number
  entry_count: number
  total_duration_seconds: number
  total_tokens: number
  tickets: TicketSummary[]
}

/**
 * Expands ~ to home directory.
 */
function expandPath(filePath: string): string {
  if (filePath.startsWith("~/")) {
    return path.join(os.homedir(), filePath.slice(2))
  }
  return filePath
}

/**
 * Parses a CSV line with all quoted fields.
 * Returns array of field values with quotes removed.
 */
function parseCSVLine(line: string): string[] {
  const matches = line.match(/"([^"]*)"/g)
  if (!matches) {
    return []
  }
  return matches.map((field) => field.slice(1, -1))
}

/**
 * Compares two time strings (HH:MM:SS) and returns the earlier one.
 */
function earlierTime(time1: string, time2: string): string {
  return time1 < time2 ? time1 : time2
}

export default tool({
  description:
    "Cumulate time tracking entries for a specific day, grouped by ticket. Returns structured data with totals per ticket for booking proposal generation.",
  args: {
    date: tool.schema
      .string()
      .describe("Date in YYYY-MM-DD format"),
  },
  async execute(args, context) {
    const { directory } = context

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(args.date)) {
      throw new Error(
        `Invalid date format: ${args.date}. Expected YYYY-MM-DD.`
      )
    }

    // Defensive check for directory
    if (!directory) {
      throw new Error(
        "Missing 'directory' in tool context. This is an OpenCode internal error."
      )
    }

    // 1. Load project config
    const projectConfigPath = path.join(
      directory,
      ".opencode",
      "opencode-project.json"
    )
    if (!fs.existsSync(projectConfigPath)) {
      throw new Error(
        `Configuration missing: ${projectConfigPath} not found. Please run /time-tracking.init first.`
      )
    }

    let projectConfig: ProjectConfig
    try {
      projectConfig = JSON.parse(fs.readFileSync(projectConfigPath, "utf-8"))
    } catch (e) {
      throw new Error(
        `Failed to parse ${projectConfigPath}: ${(e as Error).message}`
      )
    }

    const timeTracking = projectConfig.time_tracking
    if (!timeTracking?.csv_file) {
      throw new Error(
        `Missing time_tracking.csv_file in ${projectConfigPath}.`
      )
    }

    const csvFile = expandPath(timeTracking.csv_file)

    // 2. Check if CSV file exists
    if (!fs.existsSync(csvFile)) {
      // Return empty result if no CSV file yet
      return JSON.stringify({
        date: args.date,
        csv_file: csvFile,
        ticket_count: 0,
        entry_count: 0,
        total_duration_seconds: 0,
        total_tokens: 0,
        tickets: [],
      } as CumulationResult)
    }

    // 3. Read and parse CSV
    const content = fs.readFileSync(csvFile, "utf-8")
    const lines = content.trim().split("\n")

    // 4. Cumulate entries by ticket
    const ticketMap = new Map<string, TicketSummary>()
    let totalEntries = 0
    let grandTotalDuration = 0
    let grandTotalTokens = 0

    // Skip header (line 0), process data lines
    for (let i = 1; i < lines.length; i++) {
      const fields = parseCSVLine(lines[i])

      // CSV Schema (17 fields):
      // 0: id, 1: start_date, 2: end_date, 3: user, 4: ticket_name,
      // 5: issue_key, 6: account_key, 7: start_time, 8: end_time,
      // 9: duration_seconds, 10: tokens_used, 11: tokens_remaining,
      // 12: story_points, 13: description, 14: notes, 15: model, 16: agent

      if (fields.length < 14) {
        continue // Skip malformed lines
      }

      const startDate = fields[1]

      // Filter by date
      if (startDate !== args.date) {
        continue
      }

      totalEntries++

      const issueKey = fields[5] // Empty string for entries without ticket
      const accountKey = fields[6] || timeTracking.default_account_key
      const startTime = fields[7]
      const durationSeconds = parseInt(fields[9], 10) || 0
      const tokensUsed = parseInt(fields[10], 10) || 0
      const description = fields[13]

      grandTotalDuration += durationSeconds
      grandTotalTokens += tokensUsed

      // Get or create ticket summary
      const key = issueKey // Use empty string as key for "Other"
      let summary = ticketMap.get(key)

      if (!summary) {
        summary = {
          issue_key: issueKey,
          account_key: accountKey,
          first_activity: startTime,
          total_duration_seconds: 0,
          total_tokens: 0,
          entry_count: 0,
          descriptions: [],
        }
        ticketMap.set(key, summary)
      }

      // Cumulate
      summary.total_duration_seconds += durationSeconds
      summary.total_tokens += tokensUsed
      summary.entry_count++
      summary.first_activity = earlierTime(summary.first_activity, startTime)

      if (description && description.trim()) {
        summary.descriptions.push(description)
      }
    }

    // 5. Sort tickets by first_activity
    const tickets = Array.from(ticketMap.values()).sort((a, b) =>
      a.first_activity.localeCompare(b.first_activity)
    )

    // 6. Build result
    const result: CumulationResult = {
      date: args.date,
      csv_file: csvFile,
      ticket_count: tickets.length,
      entry_count: totalEntries,
      total_duration_seconds: grandTotalDuration,
      total_tokens: grandTotalTokens,
      tickets,
    }

    return JSON.stringify(result)
  },
})
