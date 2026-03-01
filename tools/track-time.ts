import { tool } from "@opencode-ai/plugin"
import fs from "fs"
import path from "path"
import os from "os"
import { randomUUID } from "crypto"

interface TimeTrackingConfig {
  csv_file: string
  default_account_key: string
  agent_defaults?: Record<string, { issue_key?: string; account_key?: string }>
  global_default?: { issue_key?: string; account_key?: string }
}

interface ProjectConfig {
  time_tracking?: TimeTrackingConfig
}

interface OpencodeConfig {
  model?: string
}

/**
 * Parses duration string to seconds.
 * Supports: 30m, 1.5h, 1h30m, 01:30
 */
function parseDuration(duration: string): number {
  // Format: HH:MM
  if (/^\d{1,2}:\d{2}$/.test(duration)) {
    const [hours, minutes] = duration.split(":").map(Number)
    return hours * 3600 + minutes * 60
  }

  // Format: 1h30m, 1.5h, 30m
  let totalSeconds = 0

  // Extract hours (1h, 1.5h)
  const hoursMatch = duration.match(/(\d+(?:\.\d+)?)\s*h/i)
  if (hoursMatch) {
    totalSeconds += parseFloat(hoursMatch[1]) * 3600
  }

  // Extract minutes (30m)
  const minutesMatch = duration.match(/(\d+)\s*m/i)
  if (minutesMatch) {
    totalSeconds += parseInt(minutesMatch[1], 10) * 60
  }

  return totalSeconds
}

/**
 * Formats seconds to human-readable duration.
 */
function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)

  if (hours > 0 && minutes > 0) {
    return `${hours}h ${minutes}m`
  } else if (hours > 0) {
    return `${hours}h`
  } else {
    return `${minutes}m`
  }
}

/**
 * Adds seconds to a time string (HH:MM:SS) and returns new time.
 * Returns { time: string, nextDay: boolean }
 */
function addSecondsToTime(
  timeStr: string,
  seconds: number
): { time: string; nextDay: boolean } {
  const [h, m, s] = timeStr.split(":").map(Number)
  let totalSeconds = h * 3600 + m * 60 + s + seconds

  const nextDay = totalSeconds >= 86400
  if (nextDay) {
    totalSeconds -= 86400
  }

  const newH = Math.floor(totalSeconds / 3600)
  const newM = Math.floor((totalSeconds % 3600) / 60)
  const newS = totalSeconds % 60

  return {
    time: `${String(newH).padStart(2, "0")}:${String(newM).padStart(2, "0")}:${String(newS).padStart(2, "0")}`,
    nextDay,
  }
}

/**
 * Adds days to a date string (YYYY-MM-DD).
 */
function addDaysToDate(dateStr: string, days: number): string {
  const date = new Date(dateStr)
  date.setDate(date.getDate() + days)
  return date.toISOString().split("T")[0]
}

/**
 * Gets today's date in YYYY-MM-DD format.
 */
function getTodayDate(): string {
  return new Date().toISOString().split("T")[0]
}

/**
 * Gets current time in HH:MM format.
 */
function getCurrentTime(): string {
  const now = new Date()
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`
}

/**
 * Gets current time in HH:MM:SS format (with seconds).
 */
function getCurrentTimeWithSeconds(): string {
  const now = new Date()
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`
}

/**
 * Calculates duration in seconds between two times (HH:MM:SS format).
 * Throws error if endTime is before startTime.
 */
function calculateDurationBetweenTimes(startTime: string, endTime: string): number {
  const [sh, sm, ss] = startTime.split(":").map(Number)
  const [eh, em, es] = endTime.split(":").map(Number)
  
  const startSeconds = sh * 3600 + sm * 60 + (ss || 0)
  const endSeconds = eh * 3600 + em * 60 + (es || 0)
  
  const duration = endSeconds - startSeconds
  if (duration < 0) {
    throw new Error(
      `Invalid time range: end_time of last entry (${startTime}) is after current time (${endTime}). Cannot calculate negative duration.`
    )
  }
  return duration
}

/**
 * Subtracts seconds from a time string (HH:MM:SS) and returns new time.
 */
function subtractSecondsFromTime(timeStr: string, seconds: number): string {
  const [h, m, s] = timeStr.split(":").map(Number)
  let totalSeconds = h * 3600 + m * 60 + (s || 0) - seconds
  
  if (totalSeconds < 0) {
    totalSeconds = 0
  }
  
  const newH = Math.floor(totalSeconds / 3600)
  const newM = Math.floor((totalSeconds % 3600) / 60)
  const newS = totalSeconds % 60
  
  return `${String(newH).padStart(2, "0")}:${String(newM).padStart(2, "0")}:${String(newS).padStart(2, "0")}`
}

/**
 * Calculates start time by subtracting duration from current time.
 */
function calculateStartTime(durationSeconds: number): string {
  const now = new Date()
  const startTime = new Date(now.getTime() - durationSeconds * 1000)
  return `${String(startTime.getHours()).padStart(2, "0")}:${String(startTime.getMinutes()).padStart(2, "0")}`
}

/**
 * Reads the last entry's end_time for today from the CSV file.
 */
function getLastEndTimeToday(csvFile: string, today: string): string | null {
  if (!fs.existsSync(csvFile)) {
    return null
  }

  const content = fs.readFileSync(csvFile, "utf-8")
  const lines = content.trim().split("\n")

  // Skip header, iterate from end to find last entry for today
  for (let i = lines.length - 1; i >= 1; i--) {
    const line = lines[i]
    // Parse CSV - all fields are quoted
    const fields = line.match(/"([^"]*)"/g)?.map((f) => f.slice(1, -1)) || []

    if (fields.length >= 9) {
      const startDate = fields[1] // start_date is field index 1
      if (startDate === today) {
        const endTime = fields[8] // end_time is field index 8
        // Return full HH:MM:SS
        return endTime
      }
    }
  }

  return null
}

/**
 * Escapes a string for CSV (doubles quotes).
 */
function escapeCSV(value: string): string {
  return value.replace(/"/g, '""')
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

export default tool({
  description:
    "Record a time tracking entry to CSV file. Automatically captures the calling agent and current model. Requires config in .opencode/opencode-project.json with time_tracking section.",
  args: {
    issue_key: tool.schema
      .string()
      .optional()
      .describe("JIRA issue key e.g. PROJ-123 (default: from config)"),
    description: tool.schema
      .string()
      .optional()
      .describe("Work description (default: n/a)"),
    duration: tool.schema
      .string()
      .optional()
      .describe("Duration: 30m, 1.5h, 1h30m, 01:30 (default: time since last entry or 15m)"),
    start_time: tool.schema
      .string()
      .optional()
      .describe(
        "Start time HH:MM 24h format (default: end_time of last entry today)"
      ),
    account_key: tool.schema
      .string()
      .optional()
      .describe("Tempo account key (default: from config)"),
    model: tool.schema
      .string()
      .optional()
      .describe("Model ID in format provider/model (e.g., anthropic/claude-opus-4-5)"),
  },
  async execute(args, context) {
    const { agent, directory } = context

    // Defensive checks for required context values
    if (!directory) {
      throw new Error("Missing 'directory' in tool context. This is an OpenCode internal error.")
    }

    // 1. Load project config from .opencode/opencode-project.json
    const projectConfigPath = path.join(
      directory,
      ".opencode",
      "opencode-project.json"
    )
    if (!fs.existsSync(projectConfigPath)) {
      throw new Error(
        `Configuration missing: ${projectConfigPath} not found. Please run /time-tracking.init first or create the file manually with a time_tracking section.`
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
    if (!timeTracking) {
      throw new Error(
        `Missing time_tracking section in ${projectConfigPath}. Please run /time-tracking.init first.`
      )
    }

    if (!timeTracking.csv_file) {
      throw new Error(
        `Missing time_tracking.csv_file in ${projectConfigPath}. Please run /time-tracking.init.`
      )
    }

    if (!timeTracking.global_default) {
      throw new Error(
        `Missing time_tracking.global_default in ${projectConfigPath}. Please run /time-tracking.init.`
      )
    }

    // 2. Get model from argument
    const model = args.model || ""

    // 3. Get user from environment
    const user = process.env.OPENCODE_USER_EMAIL
    if (!user) {
      throw new Error(
        `OPENCODE_USER_EMAIL environment variable not set. Please add it to your .env file.`
      )
    }

    // 4. Resolve defaults based on agent
    const agentName = agent || "unknown"
    const agentKey = agentName.startsWith("@") ? agentName : `@${agentName}`
    const agentDefaults = timeTracking.agent_defaults?.[agentKey]
    const globalDefault = timeTracking.global_default

    // 5. Parse and apply defaults for all arguments
    
    // Issue key (resolve first as it doesn't depend on time calculations)
    let issueKey = args.issue_key
    if (!issueKey) {
      issueKey =
        agentDefaults?.issue_key || globalDefault?.issue_key || undefined
    }
    if (!issueKey) {
      throw new Error(
        `No issue_key provided and no default configured for agent ${agentKey}. Please provide issue_key or configure agent_defaults in opencode-project.json.`
      )
    }
    if (!/^[A-Z]+-\d+$/.test(issueKey)) {
      throw new Error(
        `Invalid issue_key format: ${issueKey}. Expected format like PROJ-123.`
      )
    }

    // Description
    const description = args.description || "n/a"

    // Account key
    let accountKey = args.account_key
    if (!accountKey) {
      accountKey =
        agentDefaults?.account_key ||
        globalDefault.account_key
    }

    // Time calculations
    const today = getTodayDate()
    const csvFile = expandPath(timeTracking.csv_file)
    const currentTime = getCurrentTimeWithSeconds() // Current time with seconds (HH:MM:SS)
    
    // Get last entry's end_time for today (HH:MM:SS)
    const lastEndTime = getLastEndTimeToday(csvFile, today)
    
    // Resolve start_time, duration, and end_time based on what's provided
    let startTimeFormatted: string
    let durationSeconds: number
    let endTime: string
    let endDate = today
    const startDate = today

    if (args.duration) {
      // Duration explicitly provided - validate format
      if (
        !/^(\d+(?:\.\d+)?h)?(\d+m)?$|^\d{1,2}:\d{2}$|^\d+(?:\.\d+)?h$|^\d+m$/.test(
          args.duration
        )
      ) {
        throw new Error(
          `Invalid duration format: ${args.duration}. Use formats like: 30m, 1.5h, 1h30m, 01:30`
        )
      }
      durationSeconds = parseDuration(args.duration)
      
      if (args.start_time) {
        // Both duration and start_time provided - calculate end_time
        if (!/^\d{2}:\d{2}$/.test(args.start_time)) {
          throw new Error(
            `Invalid start_time format: ${args.start_time}. Expected HH:MM (24-hour format).`
          )
        }
        startTimeFormatted = `${args.start_time}:00`
        const result = addSecondsToTime(startTimeFormatted, durationSeconds)
        endTime = result.time
        if (result.nextDay) {
          endDate = addDaysToDate(startDate, 1)
        }
      } else {
        // Duration provided, no start_time - end at current time, calculate start
        endTime = currentTime
        startTimeFormatted = subtractSecondsFromTime(currentTime, durationSeconds)
      }
    } else {
      // No duration provided - use smart calculation
      if (args.start_time) {
        // start_time provided, no duration - end at current time, calculate duration
        if (!/^\d{2}:\d{2}$/.test(args.start_time)) {
          throw new Error(
            `Invalid start_time format: ${args.start_time}. Expected HH:MM (24-hour format).`
          )
        }
        startTimeFormatted = `${args.start_time}:00`
        endTime = currentTime
        durationSeconds = calculateDurationBetweenTimes(startTimeFormatted, endTime)
      } else if (lastEndTime) {
        // No duration, no start_time, but have last entry - seamless continuation
        // start_time = last end_time, end_time = now, duration = difference
        startTimeFormatted = lastEndTime
        endTime = currentTime
        durationSeconds = calculateDurationBetweenTimes(startTimeFormatted, endTime)
      } else {
        // No duration, no start_time, no last entry - fallback to 15m
        durationSeconds = parseDuration("15m")
        endTime = currentTime
        startTimeFormatted = subtractSecondsFromTime(currentTime, durationSeconds)
      }
    }

    // 7. Generate UUID and build CSV line
    const id = randomUUID()
    const ticketName = ""
    const tokensUsed = ""
    const tokensRemaining = ""
    const storyPoints = ""
    const notes = ""

    // All fields in double quotes
    const csvLine = [
      id,
      startDate,
      endDate,
      user,
      ticketName,
      issueKey,
      accountKey,
      startTimeFormatted,
      endTime,
      durationSeconds.toString(),
      tokensUsed,
      tokensRemaining,
      storyPoints,
      escapeCSV(description),
      notes,
      model,
      agentName,
    ]
      .map((field) => `"${field}"`)
      .join(",")

    // 8. Ensure directory exists and write to CSV
    const csvDir = path.dirname(csvFile)
    if (!fs.existsSync(csvDir)) {
      fs.mkdirSync(csvDir, { recursive: true })
    }

    // Create file with header if it doesn't exist
    if (!fs.existsSync(csvFile)) {
      const header =
        "id,start_date,end_date,user,ticket_name,issue_key,account_key,start_time,end_time,duration_seconds,tokens_used,tokens_remaining,story_points,description,notes,model,agent"
      fs.writeFileSync(csvFile, header + "\n", "utf-8")
    }

    // Append entry
    fs.appendFileSync(csvFile, csvLine + "\n", "utf-8")

    // 9. Return confirmation
    return JSON.stringify({
      success: true,
      entry: {
        id,
        issue_key: issueKey,
        date: startDate,
        start_time: startTimeFormatted,
        end_time: endTime,
        duration: formatDuration(durationSeconds),
        duration_seconds: durationSeconds,
        account_key: accountKey,
        description,
        model,
        agent: agentName,
        csv_file: csvFile,
      },
    })
  },
})
