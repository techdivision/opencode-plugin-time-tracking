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

## Configuration

### 1. Project Configuration

Add the `time_tracking` section to your `.opencode/opencode-project.json`:

```json
{
  "$schema": "https://raw.githubusercontent.com/techdivision/opencode-plugins/main/schemas/opencode-project.json",
  "time_tracking": {
    "csv_file": "~/time_tracking/time-tracking.csv",
    "global_default": {
      "issue_key": "PROJ-MISC",
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
      "issue_key": "PROJ-MISC",
      "account_key": "TD_GENERAL"
    },
    "agent_defaults": {
      "@developer": {
        "issue_key": "PROJ-DEV",
        "account_key": "TD_DEVELOPMENT"
      },
      "@reviewer": {
        "issue_key": "PROJ-REVIEW"
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
      "issue_key": "PROJ-MISC",
      "account_key": "TD_GENERAL"
    },
    "agent_defaults": {
      "@implementation": {
        "issue_key": "PROJ-DEV",
        "account_key": "TD_DEVELOPMENT",
        "subagents": ["@developer", "@reviewer", "@tester"]
      },
      "@coordination": {
        "issue_key": "PROJ-MGMT",
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
      "issue_key": "PROJ-DEV",
      "account_key": "TD_DEV",
      "subagents": ["@developer", "@reviewer", "@tester"]
    },
    "@developer": {
      "issue_key": "PROJ-SPECIAL"
    }
  }
}
```

In this case, `@developer` uses `PROJ-SPECIAL` as ticket (own entry takes priority) but the CSV still records `@implementation` as agent name.

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
      "issue_key": "PROJ-MISC",
      "account_key": "TD_GENERAL"
    },
    "agent_defaults": {
      "@implementation": {
        "issue_key": "PROJ-DEV",
        "account_key": "TD_DEVELOPMENT",
        "subagents": ["@developer", "@reviewer", "@tester"]
      },
      "@coordination": {
        "issue_key": "PROJ-MGMT",
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

## Events

| Event | When triggered |
|-------|----------------|
| `session.idle` | After each complete AI response (including all tool calls) |

## Development

```bash
npm install
npx tsc --noEmit
```
