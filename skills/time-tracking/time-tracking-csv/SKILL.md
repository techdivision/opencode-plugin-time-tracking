---
name: time-tracking-csv
description: This skill should be used when the user asks to "track time", "parse time entries", "understand CSV format", "format time tracking data", or needs guidance on the CSV schema, field definitions, rounding rules, and pricing configuration for time tracking.
---

# Time Tracking CSV

## Overview

This skill defines the CSV format, field definitions, rounding rules, and pricing configuration for the Time-Tracking plugin.

**Pipeline:**
```
CSV (Raw Data) → Booking (Cumulation) → Reports (Output)
      ↑                  ↑                    ↑
  THIS SKILL    time-tracking-booking  time-tracking-reports
```

**Note:** For booking suggestions and block cumulation, see skill `time-tracking-booking`.

## When to Use This Skill

- `/time-tracking.track-time` - Create new time entries (uses `time-tracking.track-time` custom tool)
- `/time-tracking.timesheet` - Overview of tracked time
- `/time-tracking.sync-worklogs` - Preparation for JIRA sync

## Custom Tool: time-tracking.track-time

The `/time-tracking.track-time` command uses a custom tool that automatically:
- Captures the **calling agent** from `context.agent`
- Reads the **model** from `opencode.json` configuration
- Validates and applies defaults from `opencode-project.json`
- Writes the entry to the CSV file

This ensures `model` and `agent` fields are always populated correctly.

### Smart Duration

When no duration is provided, the tool uses **smart duration calculation**:
- `end_time` = current time (with seconds)
- `start_time` = `end_time` of the last entry today (with seconds)
- `duration` = difference between start and end time

This allows seamless continuation from the previous entry. If no entry exists today, it falls back to 15m duration.

### Parameter Order

```
[issue_key] [description] [duration] [start_time] [account_key]
```

**Examples:**
```
/time-tracking.track-time
/time-tracking.track-time SOSO-286
/time-tracking.track-time SOSO-286 "Feature done"
/time-tracking.track-time SOSO-286 "Feature done" 1h
/time-tracking.track-time SOSO-286 "Feature done" 1h 09:30
```

## Configuration

### Environment Variable

The user email is read from the environment variable `OPENCODE_USER_EMAIL`:

```bash
# .env file in project root
OPENCODE_USER_EMAIL=user@company.com
```

If `OPENCODE_USER_EMAIL` is not set → Inform user: "Please create `.env` file with `OPENCODE_USER_EMAIL=...`"

### Project Configuration

Configuration is read from `.opencode/opencode-project.json`:

```json
{
  "time_tracking": {
    "csv_file": ".opencode/time_tracking/time-tracking.csv",
    "default_account_key": "ACCOUNT_KEY",
    "charts_dir": ".opencode/time_tracking/charts/"
  }
}
```

| Field | Description | Required |
|-------|-------------|----------|
| `csv_file` | Path to main CSV | Yes |
| `default_account_key` | Default JIRA account | Yes |
| `charts_dir` | Directory for charts | No (Default: `.opencode/time_tracking/charts/`) |
| `reports_dir` | Directory for reports | No (Default: `.opencode/time_tracking/reports/`) |
| `bookings_dir` | Directory for booking CSVs | No (Default: `.opencode/time_tracking/bookings/`) |
| `booking` | Booking configuration | No |
| `sync` | Sync endpoints configuration | No |
| `agent_defaults` | Agent-specific default tickets | No |
| `global_default` | Global fallback ticket | No |

If configuration is missing → Inform user: "Please run `/time-tracking.init`"

## Booking Configuration

Settings for booking proposals and rounding:

```json
{
  "time_tracking": {
    "booking": {
      "rounding_minutes": 5,
      "lunch_break": {
        "start": "12:00",
        "end": "13:00"
      }
    }
  }
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `booking.rounding_minutes` | integer | `5` | Rounding unit (5, 10, 15, or 30 minutes) |
| `booking.lunch_break.start` | string | `"12:00"` | Lunch break start (HH:MM) |
| `booking.lunch_break.end` | string | `"13:00"` | Lunch break end (HH:MM) |

**Used by:**
- `/time-tracking.booking-proposal` - Generates booking CSV files
- `/time-tracking.timesheet` - Displays booking suggestions

## Sync Configuration

Settings for syncing booking proposals to external systems:

```json
{
  "time_tracking": {
    "sync": {
      "calendar": {
        "calendar_id": "your-calendar@group.calendar.google.com",
        "color_id": "9"
      },
      "sheets": {
        "folder_id": "your-drive-folder-id"
      }
    }
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `sync.calendar.calendar_id` | string | Google Calendar ID for booking events |
| `sync.calendar.color_id` | string | Event color ID (optional, 1-11) |
| `sync.sheets.folder_id` | string | Google Drive folder for booking sheets |

**Used by:**
- `/time-tracking.sync-calendar` - Creates calendar events (future)
- `/time-tracking.sync-sheets` - Creates Google Sheets (future)

## Agent Default Configuration

Agent-specific default tickets for time tracking when no ticket is found in context.

### Fallback Hierarchy

The MCP plugin `opencode-time-tracking` uses the following fallback hierarchy:

```
1. Context Ticket    → From current OpenCode event (Story, Task, etc.)
       ↓ if not found
2. Agent Default     → agent_defaults["@developer"] etc.
       ↓ if agent not configured
3. Global Default    → global_default
       ↓ if not configured
4. Error             → "No ticket found"
```

### Configuration Schema

```json
{
  "time_tracking": {
    "agent_defaults": {
      "@developer": {
        "issue_key": "PROJ-DEV-001",
        "account_key": "TD_DEVELOPMENT"
      },
      "@reviewer": {
        "issue_key": "PROJ-REV-001"
      },
      "@tester": {
        "issue_key": "PROJ-QA-001"
      },
      "@coordinator": {
        "issue_key": "PROJ-PM-001"
      }
    },
    "global_default": {
      "issue_key": "PROJ-MISC-001",
      "account_key": "TD_GENERAL"
    },
    "ignored_agents": ["@time-tracking", "@internal"]
  }
}
```

### Field Reference

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `agent_defaults` | object | No | Map of agent names to default tickets |
| `agent_defaults.<agent>.issue_key` | string | Yes | JIRA Issue Key (e.g., `PROJ-123`) |
| `agent_defaults.<agent>.account_key` | string | No | Tempo Account (overrides `default_account_key`) |
| `global_default` | object | No | Fallback when agent not configured |
| `global_default.issue_key` | string | Yes | Global default JIRA Issue Key |
| `global_default.account_key` | string | No | Global default Tempo Account |
| `ignored_agents` | array | No | Agent names excluded from automatic time tracking |

### Account Key Resolution

```
1. agent_defaults[agent].account_key   (if present)
       ↓ if not set
2. global_default.account_key          (if present)
       ↓ if not set
3. time_tracking.default_account_key   (required fallback)
```

### Use Cases

| Agent | Typical Work | Default Ticket |
|-------|--------------|----------------|
| `@developer` | Development without Story context | Development Bucket |
| `@reviewer` | Code Reviews | Review Bucket |
| `@tester` | Exploratory Tests | QA Bucket |
| `@coordinator` | Meetings, Planning | PM Bucket |
| `@implementation` | Orchestration | Development Bucket |

### Excluding Agents from Automatic Tracking

Use `ignored_agents` to exclude specific agents from automatic time tracking via the `techdivision/opencode-time-tracking` plugin.

```json
{
  "time_tracking": {
    "ignored_agents": ["@time-tracking", "@internal", "@test"]
  }
}
```

**Common exclusions:**
- `@time-tracking` - The time tracking agent itself (avoids recursive tracking)
- `@internal` - Internal utility agents
- `@test` - Test/debug agents

**Note:** This only affects automatic tracking. Manual entries via `/time-tracking.track-time` are not affected.

## CSV Schema: time-tracking.csv

### Header

```csv
id,start_date,end_date,user,ticket_name,issue_key,account_key,start_time,end_time,duration_seconds,tokens_used,tokens_remaining,story_points,description,notes,model,agent
```

### Fields

| # | Field | Type | Description | Example |
|---|-------|------|-------------|---------|
| 1 | `id` | UUID | Unique ID | `1e74792a-b460-4b55-a2e6-36c0ad8d062b` |
| 2 | `start_date` | Date | Start date (YYYY-MM-DD) | `2025-01-05` |
| 3 | `end_date` | Date | End date (YYYY-MM-DD) | `2025-01-05` |
| 4 | `user` | String | User email | `user@company.com` |
| 5 | `ticket_name` | String | Ticket title | `Bug SOSO-178: Fix ESLint` |
| 6 | `issue_key` | String | JIRA Issue Key | `SOSO-178` |
| 7 | `account_key` | String | Tempo Account Key | `TD_KS_1100_...` |
| 8 | `start_time` | Time | Start time (HH:MM:SS) | `15:58:00` |
| 9 | `end_time` | Time | End time (HH:MM:SS) | `17:32:00` |
| 10 | `duration_seconds` | Integer | Duration in seconds | `5640` |
| 11 | `tokens_used` | Integer | Token usage (optional) | `92988` |
| 12 | `tokens_remaining` | Integer | Remaining tokens (optional) | `107012` |
| 13 | `story_points` | Integer | Story Points (optional) | `5` |
| 14 | `description` | String | Work description | `Fixed ESLint blocking...` |
| 15 | `notes` | String | Additional notes | `CI config fixes completed` |
| 16 | `model` | String | LLM model (auto-captured) | `anthropic/claude-opus-4` |
| 17 | `agent` | String | Calling agent (auto-captured) | `build` |

### Example Entry

```csv
"1e74792a-b460-4b55-a2e6-36c0ad8d062b","2025-01-05","2025-01-05","user@company.com","Bug SOSO-178: Fix ESLint","SOSO-178","TD_KS_1100_SYSTEM","15:58:00","17:32:00","5640","92988","107012","","Fixed ESLint blocking","CI fixes completed","anthropic/claude-opus-4","build"
```

## CSV Parsing

### Important: All Fields Are Quoted

The CSV file has **all fields in quotes**. These must be considered when parsing:

```csv
"uuid","2026-01-09","2026-01-09","user@company.com","","PROJ-110",...
```

### Bash: Filter by Date

```bash
# WRONG - finds nothing because quotes are missing
awk -F',' '$2=="2026-01-09"' .opencode/time_tracking/time-tracking.csv

# CORRECT - with quotes in comparison
awk -F',' '$2=="\"2026-01-09\""' .opencode/time_tracking/time-tracking.csv

# BETTER - remove quotes then filter
awk -F',' '{gsub(/"/, ""); if ($2=="2026-01-09") print}' .opencode/time_tracking/time-tracking.csv
```

### Bash: Extract Fields

```bash
# Remove quotes when extracting
awk -F',' '{
  gsub(/"/, "", $2);   # start_date
  gsub(/"/, "", $8);   # start_time
  gsub(/"/, "", $9);   # end_time
  gsub(/"/, "", $10);  # duration_seconds
  gsub(/"/, "", $11);  # tokens_used
  gsub(/"/, "", $6);   # issue_key
  gsub(/"/, "", $14);  # description
  gsub(/"/, "", $16);  # model
  print $2, $8, $9, $10, $11, $6, $14, $16
}' .opencode/time_tracking/time-tracking.csv
```

### Recommended Parsing Pattern

```bash
# Complete: Filter + extract fields + remove quotes
awk -F',' '
  NR > 1 {  # Skip header
    # Remove quotes from all relevant fields
    for (i=1; i<=NF; i++) gsub(/"/, "", $i)
    
    # Filter by date
    if ($2 == "2026-01-09") {
      print $8, $9, $10, $11, $6, $14, $16
    }
  }
' .opencode/time_tracking/time-tracking.csv
```

## CSV Schema: worklogs-sync.csv

For `/time-tracking.sync-worklogs` - combines Time-Tracking + Calendar:

```csv
date,start_time,duration_hours,issue_key,account_key,calendar_event_id,description,source,sync_status
```

| Field | Description |
|-------|-------------|
| `date` | Date (YYYY-MM-DD) |
| `start_time` | Rounded start time (HH:MM) |
| `duration_hours` | Duration in hours (rounded) |
| `issue_key` | JIRA Issue Key |
| `account_key` | Tempo Account Key |
| `calendar_event_id` | Google Calendar Event ID |
| `description` | Description |
| `source` | `time-tracking` or `calendar` |
| `sync_status` | `pending`, `draft`, `synced` |

## Rounding Rules

### Time Rounding (5-Minute Precision)

Round to nearest 5-minute mark:

| Original | Rounded |
|----------|---------|
| 09:03 | 09:05 |
| 09:07 | 09:05 |
| 09:08 | 09:10 |
| 14:23:00 | 14:25 |
| 14:22:29 | 14:20 |

**Formula:**
```
rounded_minutes = round(minutes / 5) * 5
```

### Duration Rounding (5-Minute Precision)

Round seconds to nearest 5-minute unit:

| Seconds | Minutes | Rounded | Hours |
|---------|---------|---------|-------|
| 120 | 2 min | 5 min | 0.0833h |
| 180 | 3 min | 5 min | 0.0833h |
| 600 | 10 min | 10 min | 0.1667h |
| 5640 | 94 min | 95 min | 1.5833h |

**Formula:**
```
rounded_minutes = round(seconds / 60 / 5) * 5
duration_hours = rounded_minutes / 60
```

## Sequential Consolidation (Basic)

For raw display, directly consecutive entries with the same `issue_key` are merged:

**Rules:**
1. Only if entries **directly follow each other** (no others in between)
2. Only if `issue_key` is **not empty** and **identical**
3. `description`: Combined with " + "

**Note:** For extended cumulation with gap tolerance and value-oriented descriptions, see skill `time-tracking-booking`.

## CSV Generation in Bash

### Escaping Function

```bash
escape_csv() {
  echo "$1" | sed 's/"/""/g'
}
```

### Format CSV Line

```bash
uuid=$(uuidgen | tr '[:upper:]' '[:lower:]')
description=$(escape_csv "Fixed \"critical\" bug")
notes=$(escape_csv "All tests passing")

# ALL fields in quotes (17 fields including model and agent)
csv_line="\"${uuid}\",\"${start_date}\",\"${end_date}\",\"${user}\",\"${ticket_name}\",\"${issue_key}\",\"${account_key}\",\"${start_time}\",\"${end_time}\",\"${duration_seconds}\",\"${tokens_used}\",\"${tokens_remaining}\",\"${story_points}\",\"${description}\",\"${notes}\",\"${model}\",\"${agent}\""

echo "$csv_line" >> "$csv_file"
```

### Important Rules

- **All fields** in double quotes `""`
- **Escape quotes** in values: `"` → `""`
- **Empty fields** as `""` (not empty commas)
- **Integer fields** also in quotes

## Duration Calculation

### Seconds to Hours (Rounded)

```bash
# Seconds → rounded hours
duration_seconds=5640
rounded_minutes=$(( (duration_seconds + 150) / 300 * 5 ))  # +150 for rounding
duration_hours=$(echo "scale=4; $rounded_minutes / 60" | bc)
# 5640 sec → 95 min → 1.5833h
```

### Sessions Over Midnight

When `start_date` ≠ `end_date`:
```
start: 2025-01-05 23:34:00
end:   2025-01-06 00:11:00
→ duration = 37 min = 2220 sec
```

## Token Tracking

### Model Field

The `model` field contains the combination of provider and model:

```
{providerID}/{modelID}
```

**Examples:**
- `anthropic/claude-opus-4`
- `anthropic/claude-opus-4-5`
- `anthropic/claude-sonnet-4`

### Token Formatting

For display, tokens are formatted:

| Value | Format | Example |
|-------|--------|---------|
| < 1,000 | Number | `500` |
| 1,000 - 999,999 | K | `125K` |
| >= 1,000,000 | M | `1.2M` |

**Formula:**
```bash
format_tokens() {
  local tokens=$1
  if [ $tokens -ge 1000000 ]; then
    echo "$(echo "scale=1; $tokens / 1000000" | bc)M"
  elif [ $tokens -ge 1000 ]; then
    echo "$(echo "scale=0; $tokens / 1000" | bc)K"
  else
    echo "$tokens"
  fi
}
```

### Tokens/Hour (Efficiency)

```
tokens_per_hour = total_tokens / total_hours
```

**Example:** 12M Tokens in 5.2h = 2.3M/h

## Pricing Configuration

Costs are calculated based on configuration in `.opencode/opencode-project.json`.

### Schema

| Field | Type | Description |
|-------|------|-------------|
| `pricing.ratio.input` | number | Input token ratio (0.0-1.0), Default: 0.8 |
| `pricing.ratio.output` | number | Output token ratio (0.0-1.0), Default: 0.2 |
| `pricing.default` | object | Fallback pricing when model not found |
| `pricing.default.input` | number | Input price per MTok in $ |
| `pricing.default.output` | number | Output price per MTok in $ |
| `pricing.periods` | array | Time-dependent model prices |
| `pricing.periods[].from` | string | Start date (YYYY-MM-DD) |
| `pricing.periods[].models` | object | Model → Pricing mapping |

### Lookup Algorithm

```
1. Find last `periods` entry where `from <= start_date`
2. Search `model` in `periods[].models`
3. If not found → use `pricing.default`
4. Calculate cost with formula
```

### Cost Formula

```
cost = tokens × (ratio.input × price.input + ratio.output × price.output) / 1_000_000
```

### Example Calculation

Entry: `start_date=2026-01-05`, `model=anthropic/claude-opus-4-5`, `tokens=1_500_000`

1. Period `from: 2025-12-20` fits (≤ 2026-01-05)
2. Model found: `{ input: 5, output: 25 }`
3. Ratio: `{ input: 0.8, output: 0.2 }`
4. Cost: `1.5M × (0.8 × $5 + 0.2 × $25) / 1M = 1.5 × $9 = $13.50`

### Pricing Template

Copy this template into `opencode-project.json` under `time_tracking.pricing`:

```json
{
  "ratio": { "input": 0.8, "output": 0.2 },
  "default": { "input": 3, "output": 15 },
  "periods": [
    {
      "from": "2025-11-01",
      "models": {
        "anthropic/claude-opus-4": { "input": 15, "output": 75 },
        "anthropic/claude-sonnet-4": { "input": 3, "output": 15 }
      }
    },
    {
      "from": "2025-12-20",
      "models": {
        "anthropic/claude-opus-4": { "input": 15, "output": 75 },
        "anthropic/claude-opus-4-5": { "input": 5, "output": 25 },
        "anthropic/claude-sonnet-4": { "input": 3, "output": 15 },
        "anthropic/claude-sonnet-4-5": { "input": 3, "output": 15 }
      }
    }
  ]
}
```

### Current Anthropic Prices (January 2026)

| Model | Input $/MTok | Output $/MTok |
|-------|--------------|---------------|
| `anthropic/claude-opus-4` | $15 | $75 |
| `anthropic/claude-opus-4-5` | $5 | $25 |
| `anthropic/claude-sonnet-4` | $3 | $15 |
| `anthropic/claude-sonnet-4-5` | $3 | $15 |
| `anthropic/claude-haiku-4-5` | $1 | $5 |

Source: https://docs.anthropic.com/en/docs/about-claude/pricing

### Updating Pricing

When new models appear or prices change:

1. Add new `period` entry with date
2. Enter all models with current prices
3. `/time-tracking.timesheet` automatically uses correct pricing based on `start_date`

## References

- **`/time-tracking.track-time`** - Create time entries (uses custom tool)
- **`time-tracking.track-time`** - Custom tool for CSV writing
- **`/time-tracking.timesheet`** - View overview
- **`/time-tracking.sync-worklogs`** - Prepare JIRA sync
- **`time-tracking-booking`** - Booking suggestions and block cumulation
- **`time-tracking-reports`** - Report generation with token statistics
