# @techdivision/opencode-plugin-time-tracking

Automatic time tracking plugin for OpenCode. Tracks session duration and tool usage, writing entries to a CSV file compatible with Jira worklog sync incl. commands, skills and agents.

## Overview

| Content Type | Name | Description |
|--------------|------|-------------|
| Plugin | `src/Plugin.ts` | Plugin entry point with event and tool hooks |
| Skills | `time-tracking-csv`, `time-tracking-reports`, `time-tracking-booking`, `time-tracking-calendar-sync`, `time-tracking-tempo-sync` | On-demand knowledge for time tracking workflows |
| Agents | `time-tracking`, `booking-proposal`, `calendar-sync`, `drive-sync`, `tempo-sync`, `worklog` | Specialized agents for tracking and sync tasks |
| Commands | `track-time`, `timesheet`, `booking-proposal`, `sync-calendar`, `sync-drive`, `sync-tempo`, `sync-worklogs`, `init` | Slash commands for time tracking operations |
| Tools | `track-time`, `cumulate-daily-worklogs`, `sync-tempo-worklog` | Custom tools for CSV writing and worklog sync |

## Prerequisites

### opencode-plugin-shell-env (required)

This plugin relies on [`@techdivision/opencode-plugin-shell-env`](https://github.com/techdivision/opencode-plugin-shell-env) to load environment variables from `.opencode/.env` into `process.env`. This is required for variables like `OPENCODE_USER_EMAIL` and any other secrets used by the time tracking tools.

**Important:** The `shell-env` plugin must be listed **before** `time-tracking` in your `.opencode/opencode.json`, because plugins are loaded in order and `shell-env` needs to populate `process.env` before this plugin reads from it:

```json
{
  "plugin": [
    "@techdivision/opencode-plugin-shell-env",
    "@techdivision/opencode-plugin-time-tracking"
  ]
}
```

Without `shell-env`, environment variables from `.opencode/.env` will not be available. The plugin will still work, but will fall back to system environment variables or defaults (e.g., system username instead of `OPENCODE_USER_EMAIL`).

## Installation

Add to your `.opencode/package.json`:

```json
{
  "dependencies": {
    "@techdivision/opencode-plugin-shell-env": "^1.1.1",
    "@techdivision/opencode-plugin-time-tracking": "^1.0.0"
  }
}
```

Install and link:

```bash
cd .opencode && npm install
npx opencode-link shell-env
npx opencode-link time-tracking
```

When linking `time-tracking`, a postlink hook automatically:

1. Creates `~/time_tracking/` with subdirectories (`bookings/`, `charts/`, `reports/`)
2. Symlinks `.opencode/time_tracking` → `~/time_tracking`

This ensures time tracking data is stored globally in your home directory and shared across projects. If `~/time_tracking/` already exists, the hook only creates missing subdirectories. If `.opencode/time_tracking` is a real directory (not a symlink), it is left untouched.

## Configuration

### 1. Project Configuration

Add the `time_tracking` section to your `.opencode/opencode-project.json`:

```json
{
  "$schema": "https://raw.githubusercontent.com/techdivision/opencode-plugins/main/schemas/opencode-project.json",
  "time_tracking": {
    "csv_file": "~/time_tracking/time-tracking.csv",
    "global_default": {
      "issue_key": "PROJ-100",
      "account_key": "YOUR_ACCOUNT_KEY"
    }
  }
}
```

### 2. User Email (Environment Variable)

Set your user email via the `OPENCODE_USER_EMAIL` environment variable.

Add to your `.opencode/.env` file (loaded automatically by `opencode-plugin-shell-env`):

```env
OPENCODE_USER_EMAIL=your@email.com
```

Or export in your shell:

```bash
export OPENCODE_USER_EMAIL=your@email.com
```

If not set, the system username is used as fallback.

## Configuration Options

### Required Fields

| Field | Description |
|-------|-------------|
| `csv_file` | Path to the CSV output file (supports `~/`, absolute, or relative paths) |
| `global_default.issue_key` | Default JIRA issue key when no ticket found in context |
| `global_default.account_key` | Default Tempo account key for time entries |

### Optional Fields

#### Agent-specific Defaults

Override default ticket/account for specific agents:

```json
{
  "time_tracking": {
    "csv_file": "...",
    "global_default": {
      "issue_key": "PROJ-100",
      "account_key": "TD_GENERAL"
    },
    "agent_defaults": {
      "@developer": {
        "issue_key": "PROJ-101",
        "account_key": "TD_DEVELOPMENT"
      },
      "@reviewer": {
        "issue_key": "PROJ-102"
      }
    }
  }
}
```

#### Agent Grouping (Subagents)

Group multiple subagents under a primary agent to avoid repeating the same configuration. Subagents inherit the primary agent's `issue_key` and `account_key` as fallback, and the **primary agent name** is recorded in the CSV instead of the subagent name.

```json
{
  "time_tracking": {
    "csv_file": "...",
    "global_default": {
      "issue_key": "PROJ-100",
      "account_key": "TD_GENERAL"
    },
    "agent_defaults": {
      "@implementation": {
        "issue_key": "PROJ-101",
        "account_key": "TD_DEVELOPMENT",
        "subagents": ["@developer", "@reviewer", "@tester"]
      },
      "@coordination": {
        "issue_key": "PROJ-104",
        "account_key": "TD_MANAGEMENT",
        "subagents": ["@plan", "@build"]
      }
    }
  }
}
```

**Behavior:**
- When `@developer` runs, the CSV records `@implementation` as the agent
- Ticket and account key are resolved from `@implementation`'s config
- A subagent with its own direct entry uses that entry for ticket/account resolution, but the CSV still shows the primary agent name

**Override example:** If `@developer` needs a different ticket but should still be grouped under `@implementation`:

```json
{
  "agent_defaults": {
    "@implementation": {
      "issue_key": "PROJ-101",
      "account_key": "TD_DEVELOPMENT",
      "subagents": ["@developer", "@reviewer", "@tester"]
    },
    "@developer": {
      "issue_key": "PROJ-199"
    }
  }
}
```

In this case, `@developer` uses `PROJ-199` as ticket (own entry takes priority) but the CSV still records `@implementation` as agent name.

#### Ignored Agents

Skip time tracking for specific agents:

```json
{
  "time_tracking": {
    "csv_file": "...",
    "global_default": { "..." : "..." },
    "ignored_agents": ["@internal", "@notrack"]
  }
}
```

#### Title Generation

The plugin can generate meaningful worklog descriptions via an LLM instead of generic tool-count summaries (e.g., `"48 tool call(s)"`). The generated description is prepended to the activity summary: `"COPSPA-65: Startup-Hang fixen und Provider-Aufloesung auf Config umstellen | 3 file edit(s), 2 file read(s)"`.

The LLM receives the last 3 conversation turns (user + assistant) as context to understand what was worked on. Both `model` and `api_url` are required. Without configuration, title generation is inactive and the plugin falls back to activity summaries.

**Ollama (local or remote, no API key required):**

```json
{
  "time_tracking": {
    "title_generation": {
      "model": "ollama/mistral:latest",
      "api_url": "http://localhost:11434/v1"
    }
  }
}
```

**With locale and custom prompt:**

```json
{
  "time_tracking": {
    "title_generation": {
      "model": "ollama/llama3:8b",
      "api_url": "http://localhost:11434/v1",
      "locale": "en-US",
      "prompt": "time_tracking/prompts/title.txt"
    }
  }
}
```

**Explicitly disabled:**

```json
{
  "time_tracking": {
    "title_generation": {
      "enabled": false
    }
  }
}
```

| Field | Required | Default | Description |
|-------|----------|---------|-------------|
| `model` | Yes | — | Model in `"provider/model"` or plain `"model"` format |
| `api_url` | Yes | — | API base URL (`/chat/completions` is appended) |
| `api_key` | No | — | API key, supports `{env:VAR_NAME}` syntax |
| `locale` | No | `de-DE` | Output language (BCP 47 tag) |
| `enabled` | No | `true` | Set to `false` to disable |
| `prompt` | No | Built-in | Path to custom prompt file (relative to `.opencode/`) |
| `timeout_ms` | No | `5000` | LLM request timeout in milliseconds |
| `max_chars` | No | `240` | Maximum description length |

Custom prompt files support `{{LOCALE}}` and `{{MAX_CHARS}}` placeholders that are replaced at runtime with the configured values.

All requests use the Chat Completions API format. This covers Ollama, OpenAI, Mistral, Groq, and any compatible provider.

#### Project Whitelist

Restrict ticket detection to specific JIRA projects:

```json
{
  "time_tracking": {
    "csv_file": "...",
    "global_default": { "..." : "..." },
    "valid_projects": ["PROJ", "SOSO", "FEAT"]
  }
}
```

### Full Example

```json
{
  "$schema": "https://raw.githubusercontent.com/techdivision/opencode-plugins/main/schemas/opencode-project.json",
  "time_tracking": {
    "csv_file": "~/time_tracking/time-tracking.csv",
    "global_default": {
      "issue_key": "PROJ-100",
      "account_key": "TD_GENERAL"
    },
    "title_generation": {
      "model": "ollama/mistral:latest",
      "api_url": "http://localhost:11434/v1"
    },
    "agent_defaults": {
      "@implementation": {
        "issue_key": "PROJ-101",
        "account_key": "TD_DEVELOPMENT",
        "subagents": ["@developer", "@reviewer", "@tester"]
      },
      "@coordination": {
        "issue_key": "PROJ-104",
        "account_key": "TD_MANAGEMENT",
        "subagents": ["@plan", "@build"]
      }
    },
    "ignored_agents": ["@time-tracking"],
    "valid_projects": ["PROJ", "SOSO"]
  }
}
```

## Ticket Detection

### Pattern

By default, tickets must have at least 2 uppercase letters followed by a number:
- Matches: `PROJ-123`, `SOSO-1`, `AB-99`
- Does not match: `V-1`, `X-9` (single letter), `UTF-8` (common false positive)

### Project Whitelist

When `valid_projects` is configured, only tickets from those projects are recognized:

With whitelist:
- Matches: `PROJ-123`, `SOSO-1`, `FEAT-99`
- Does not match: `UTF-8`, `ISO-9001`, `OTHER-123`

Without whitelist (default):
- Matches any pattern with 2+ uppercase letters: `PROJ-123`, `AB-1`
- Does not match single-letter prefixes: `V-1`, `X-99`

## Fallback Hierarchy

### Ticket Resolution

1. Context ticket (from messages/todos)
2. Direct agent-specific `issue_key` (if agent has its own entry)
3. Primary agent's `issue_key` (if agent is listed in a `subagents` array)
4. `global_default.issue_key`

### Account Key Resolution

1. Direct agent-specific `account_key` (if agent has its own entry)
2. Primary agent's `account_key` (if agent is listed in a `subagents` array)
3. `global_default.account_key`

### CSV Agent Name

1. Primary agent name (if agent is listed in a `subagents` array)
2. Actual agent name (if no subagent mapping exists)

## How It Works

- Tracks tool executions during each session turn
- Extracts JIRA ticket from user messages or todos
- Writes CSV entry when session becomes idle
- Shows toast notification with tracked time

## CSV Format

```
id,start_date,end_date,user,ticket_name,issue_key,account_key,start_time,end_time,duration_seconds,tokens_used,tokens_remaining,story_points,description,notes
```

## Webhook Integration

The plugin can send time tracking entries to a webhook endpoint in addition to writing them to CSV. This enables real-time integration with external systems.

### Configuration

Set the following environment variables in `.opencode/.env`:

| Variable | Required | Description |
|----------|----------|-------------|
| `TT_WEBHOOK_URL` | No | Webhook endpoint URL. If not set, webhook is disabled. |
| `TT_WEBHOOK_BEARER_TOKEN` | No | Bearer token for webhook authentication. If set, adds `Authorization: Bearer <token>` header. |

Example `.opencode/.env`:

```env
TT_WEBHOOK_URL=https://your-api.example.com/time-tracking
TT_WEBHOOK_BEARER_TOKEN=your-secret-token
```

### Behavior

- **Dual output:** Both CSV and webhook are triggered on each session idle event
- **Order:** CSV is written first (as backup), then webhook is called
- **Failure handling:** Webhook failures show a toast notification but don't block CSV writing
- **Consistent ID:** The same UUID is used for both CSV entry and webhook payload

### Webhook Payload

The webhook receives a POST request with `Content-Type: application/json`. The payload matches the CSV entry structure (snake_case field names):

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "start_date": "2026-03-05",
  "end_date": "2026-03-05",
  "user": "your@email.com",
  "ticket_name": "",
  "issue_key": "PROJ-123",
  "account_key": "TD_DEVELOPMENT",
  "start_time": "09:00:00",
  "end_time": "09:15:00",
  "duration_seconds": 900,
  "tokens_used": 2800,
  "tokens_remaining": "",
  "story_points": "",
  "description": "Implemented webhook sender service",
  "notes": "",
  "model": "anthropic/claude-sonnet-4-20250514",
  "agent": "@developer",
  "tokens_input": 1500,
  "tokens_output": 800,
  "tokens_reasoning": 0,
  "tokens_cache_read": 500,
  "tokens_cache_write": 0,
  "cost": 0.027
}
```

### Extending with Custom Writers

The plugin uses a `WriterService` interface for output. You can implement custom writers by following the interface:

```typescript
interface WriteResult {
  writer: string;      // e.g., "csv", "webhook"
  success: boolean;
  error?: string;      // Only present if success === false
}

interface WriterService {
  write(data: CsvEntryData): Promise<WriteResult>;
}
```

Each writer returns a `WriteResult` indicating success or failure. The `EventHook` collects all results and shows a combined toast notification (e.g., "Time tracked: 5 min, 1000 tokens for PROJ-123 (webhook: failed)").

## Sync Features

The plugin provides several sync commands to export time tracking data to external systems.

### Commands Overview

| Command | Description | Agent |
|---------|-------------|-------|
| `/time-tracking.booking-proposal` | Generate daily booking proposal from tracked time | `booking-proposal` |
| `/time-tracking.sync-drive` | Upload CSV to Google Drive | `drive-sync` |
| `/time-tracking.sync-calendar` | Sync booking proposals to Google Calendar | `calendar-sync` |
| `/time-tracking.sync-tempo` | Sync booking proposals to JIRA Tempo worklogs | `tempo-sync` |
| `/time-tracking.sync-worklogs` | Prepare time entries + calendar events for worklog sync | (inline) |

### Typical Workflow

```
1. /time-tracking.booking-proposal          # Generate booking proposal for today
2. /time-tracking.sync-drive                # Upload booking proposal to Drive
3. /time-tracking.sync-calendar             # Create calendar events from proposal
4. /time-tracking.sync-tempo                # Create Tempo worklogs from proposal
```

### Environment Variables

All sync-related secrets should be configured in `.opencode/.env` (loaded by `opencode-plugin-shell-env`):

| Variable | Required | Used by | Description |
|----------|----------|---------|-------------|
| `OPENCODE_USER_EMAIL` | Yes | All | User email for CSV entries and file naming |
| `TT_WEBHOOK_URL` | No | Webhook | Webhook endpoint URL (disabled if not set) |
| `TT_WEBHOOK_BEARER_TOKEN` | No | Webhook | Bearer token for webhook authentication |
| `TT_SOURCE_CALENDAR_ID` | No | Booking-Proposal | Source calendar for meeting integration |
| `TT_BOOKING_CALENDAR_ID` | For Calendar Sync | Calendar Sync | Target calendar for booking events |
| `TT_DRIVE_FOLDER_ID` | For Drive Sync | Drive Sync | Google Drive folder ID for CSV upload |
| `TT_TEMPO_API_TOKEN` | For Tempo Sync | Tempo Sync | Tempo API Bearer Token |
| `TT_ATLASSIAN_ACCOUNT_ID` | For Tempo Sync | Tempo Sync | Atlassian Account ID for worklog author |

Example `.opencode/.env`:

```env
OPENCODE_USER_EMAIL=j.doe@example.com

# Webhook Integration (optional)
TT_WEBHOOK_URL=https://your-api.example.com/time-tracking
TT_WEBHOOK_BEARER_TOKEN=your-secret-token

# Google Calendar Sync
TT_SOURCE_CALENDAR_ID=j.doe@example.com
TT_BOOKING_CALENDAR_ID=c_abc123@group.calendar.google.com

# Google Drive Sync
TT_DRIVE_FOLDER_ID=1_L1iKvRgfirDpGWhTCvGDdyZh9dl-Vjs

# Tempo Sync
TT_TEMPO_API_TOKEN=your-tempo-api-token
TT_ATLASSIAN_ACCOUNT_ID=5b10a2844c20165700ede21g
```

### Google Drive Sync

Uploads CSV files to a Google Drive folder.

**Two modes:**

| Mode | Command | Description |
|------|---------|-------------|
| Default | `/time-tracking.sync-drive [period]` | Upload booking-proposal CSV for a specific date |
| Raw | `/time-tracking.sync-drive --raw` | Upload the entire raw `time_tracking.csv` |

**File naming:**

| Mode | Pattern |
|------|---------|
| Default | `{email}-booking_proposal-{date}-{YYYYMMDDHHmmss}.csv` |
| Raw | `{email}-time_tracking-{YYYYMMDDHHmmss}.csv` |

**Prerequisite:** `TT_DRIVE_FOLDER_ID` must be set.

### Google Calendar Sync

Syncs booking proposals to Google Calendar. Creates, updates, and deletes events in the booking calendar based on the booking-proposal CSV.

```bash
/time-tracking.sync-calendar              # Today
/time-tracking.sync-calendar yesterday    # Yesterday
```

**Prerequisites:** `TT_BOOKING_CALENDAR_ID` must be set. Optionally `TT_SOURCE_CALENDAR_ID` for source calendar integration.

### Tempo Sync

Syncs booking proposals to JIRA Tempo as worklogs. Creates, updates, and deletes worklogs based on the booking-proposal CSV.

```bash
/time-tracking.sync-tempo                 # Today
/time-tracking.sync-tempo yesterday       # Yesterday
```

**Prerequisites:** `TT_TEMPO_API_TOKEN` and `TT_ATLASSIAN_ACCOUNT_ID` must be set. All booking entries must have an `issue_key`.

### Sync Configuration

Add sync endpoints to your `.opencode/opencode-project.json`:

```json
{
  "time_tracking": {
    "sync": {
      "drive": {
        "folder_id": "{env.TT_DRIVE_FOLDER_ID}"
      },
      "calendar": {
        "source_calendar_id": "{env.TT_SOURCE_CALENDAR_ID}",
        "booking_calendar_id": "{env.TT_BOOKING_CALENDAR_ID}",
        "ticket_pattern": "([A-Z]+-\\d+)",
        "account_pattern": "(TD_[A-Z0-9_]+)",
        "color_id": "9",
        "filter": {
          "exclude_title_patterns": ["^\\[PRIVAT\\]"],
          "require_accepted": true,
          "exclude_all_day": true
        }
      },
      "tempo": {
        "api_token": "{env.TT_TEMPO_API_TOKEN}",
        "base_url": "https://api.tempo.io",
        "atlassian_account_id": "{env.TT_ATLASSIAN_ACCOUNT_ID}"
      }
    }
  }
}
```

## Events

| Event | When triggered |
|-------|----------------|
| `session.status` (idle) | After each complete AI response (including all tool calls) |

## Development

```bash
npm install
npx tsc --noEmit
```
