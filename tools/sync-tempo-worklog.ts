import { tool } from "@opencode-ai/plugin"

/**
 * Sync a single worklog entry to Tempo Timesheets.
 * Supports create, update, and delete actions.
 *
 * The calling agent is responsible for reading credentials from .env
 * and passing them as arguments to this tool.
 */

interface SyncResult {
  success: boolean
  action: string
  tempo_worklog_id?: string
  message: string
}

/**
 * Builds the payload for Tempo API create/update requests.
 */
function buildPayload(args: {
  author_account_id?: string
  issue_id?: number
  start_date?: string
  start_time?: string
  duration_seconds?: number
  description?: string
  account_key?: string
}): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    authorAccountId: args.author_account_id,
    issueId: args.issue_id,
    startDate: args.start_date,
    startTime: args.start_time,
    timeSpentSeconds: args.duration_seconds,
  }

  if (args.description) {
    payload.description = args.description
  }

  if (args.account_key) {
    payload.attributes = [{ key: "_Account_", value: args.account_key }]
  }

  return payload
}

export default tool({
  description:
    "Sync a single worklog entry to Tempo Timesheets. " +
    "Supports create, update, and delete actions. " +
    "The agent must read credentials from .env and pass them as arguments.",
  args: {
    action: tool.schema
      .enum(["create", "update", "delete"])
      .describe("Action to perform: create, update, or delete"),

    tempo_api_token: tool.schema
      .string()
      .describe("Tempo API Bearer token (from TT_TEMPO_API_TOKEN in .env)"),

    tempo_base_url: tool.schema
      .string()
      .optional()
      .describe("Tempo API base URL. Defaults to https://api.tempo.io"),

    author_account_id: tool.schema
      .string()
      .describe("Atlassian Account ID of the author (from TT_ATLASSIAN_ACCOUNT_ID in .env)"),

    issue_id: tool.schema
      .number()
      .optional()
      .describe("JIRA Issue ID (numeric). Required for create/update."),

    start_date: tool.schema
      .string()
      .optional()
      .describe("Start date in YYYY-MM-DD format. Required for create/update."),

    start_time: tool.schema
      .string()
      .optional()
      .describe("Start time in HH:mm:ss format. Required for create/update."),

    duration_seconds: tool.schema
      .number()
      .optional()
      .describe("Duration in seconds. Required for create/update."),

    description: tool.schema
      .string()
      .optional()
      .describe("Worklog description"),

    account_key: tool.schema
      .string()
      .optional()
      .describe("Tempo account key (e.g., TD_KS_1100)"),

    tempo_worklog_id: tool.schema
      .string()
      .optional()
      .describe("Tempo Worklog ID. Required for update/delete."),
  },

  async execute(args): Promise<string> {
    // 1. Get config from args (agent reads from .env and passes here)
    const tempoToken = args.tempo_api_token
    const baseUrl = args.tempo_base_url || "https://api.tempo.io"

    // 2. Validate required args based on action
    if (args.action === "create") {
      const missing: string[] = []
      if (!args.issue_id) missing.push("issue_id")
      if (!args.author_account_id) missing.push("author_account_id")
      if (!args.start_date) missing.push("start_date")
      if (!args.start_time) missing.push("start_time")
      if (args.duration_seconds === undefined) missing.push("duration_seconds")

      if (missing.length > 0) {
        const result: SyncResult = {
          success: false,
          action: args.action,
          message: `Missing required fields for create: ${missing.join(", ")}`,
        }
        return JSON.stringify(result)
      }
    }

    if (args.action === "update") {
      if (!args.tempo_worklog_id) {
        const result: SyncResult = {
          success: false,
          action: args.action,
          message: "Missing tempo_worklog_id for update",
        }
        return JSON.stringify(result)
      }

      const missing: string[] = []
      if (!args.issue_id) missing.push("issue_id")
      if (!args.author_account_id) missing.push("author_account_id")
      if (!args.start_date) missing.push("start_date")
      if (!args.start_time) missing.push("start_time")
      if (args.duration_seconds === undefined) missing.push("duration_seconds")

      if (missing.length > 0) {
        const result: SyncResult = {
          success: false,
          action: args.action,
          message: `Missing required fields for update: ${missing.join(", ")}`,
        }
        return JSON.stringify(result)
      }
    }

    if (args.action === "delete" && !args.tempo_worklog_id) {
      const result: SyncResult = {
        success: false,
        action: args.action,
        message: "Missing tempo_worklog_id for delete",
      }
      return JSON.stringify(result)
    }

    // 3. Build URL
    let url = `${baseUrl}/4/worklogs/`
    if (args.action !== "create" && args.tempo_worklog_id) {
      url += args.tempo_worklog_id
    }

    // 4. Build request
    const headers: Record<string, string> = {
      Authorization: `Bearer ${tempoToken}`,
      "Content-Type": "application/json",
    }

    const requestInit: RequestInit = {
      headers,
    }

    switch (args.action) {
      case "create":
        requestInit.method = "POST"
        requestInit.body = JSON.stringify(buildPayload(args))
        break
      case "update":
        requestInit.method = "PUT"
        requestInit.body = JSON.stringify(buildPayload(args))
        break
      case "delete":
        requestInit.method = "DELETE"
        break
    }

    // 5. Execute request
    try {
      const response = await fetch(url, requestInit)

      if (!response.ok) {
        const errorText = await response.text()
        let errorMessage: string

        try {
          const errorJson = JSON.parse(errorText)
          errorMessage = errorJson.errors?.message || errorText
        } catch {
          errorMessage = errorText
        }

        const result: SyncResult = {
          success: false,
          action: args.action,
          tempo_worklog_id: args.tempo_worklog_id,
          message: `Tempo API error (${response.status}): ${errorMessage}`,
        }
        return JSON.stringify(result)
      }

      // 6. Process successful response
      if (args.action === "create") {
        const data = await response.json()
        const worklogId = String(data.tempoWorklogId)
        const result: SyncResult = {
          success: true,
          action: "create",
          tempo_worklog_id: worklogId,
          message: `Created worklog ${worklogId}`,
        }
        return JSON.stringify(result)
      }

      if (args.action === "delete") {
        const result: SyncResult = {
          success: true,
          action: "delete",
          tempo_worklog_id: undefined,
          message: `Deleted worklog ${args.tempo_worklog_id}`,
        }
        return JSON.stringify(result)
      }

      // update
      const result: SyncResult = {
        success: true,
        action: "update",
        tempo_worklog_id: args.tempo_worklog_id,
        message: `Updated worklog ${args.tempo_worklog_id}`,
      }
      return JSON.stringify(result)
    } catch (error) {
      const result: SyncResult = {
        success: false,
        action: args.action,
        tempo_worklog_id: args.tempo_worklog_id,
        message: `Network error: ${(error as Error).message}`,
      }
      return JSON.stringify(result)
    }
  },
})
