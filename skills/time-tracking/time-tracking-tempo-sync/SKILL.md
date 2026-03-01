---
name: time-tracking-tempo-sync
description: This skill should be used when the user asks to "sync time tracking to tempo", "push bookings to jira", "sync worklogs to tempo", "create tempo worklogs from bookings", "export time entries to tempo", or needs guidance on Tempo synchronization for time tracking booking proposals.
---

# Time Tracking Tempo Sync

## Overview

Synchronizes booking proposals with JIRA Tempo Timesheets using the Tempo REST API v4.

**Pipeline:**
```
booking-proposal-{date}.csv
         │
         ▼
/time-tracking.sync-tempo
         │
         ▼
┌────────────────────────────────────┐
│   Tempo Timesheets                 │
│   - CREATE new worklogs            │
│   - UPDATE changed worklogs        │
│   - DELETE removed worklogs        │
└────────────────────────────────────┘
```

## When to Use This Skill

- Sync booking proposals to JIRA Tempo
- Create Tempo worklogs from time tracking data
- Update existing worklogs after changes
- Delete worklogs marked for removal
- Understand Tempo API integration

## Configuration

### Environment Variables

All Tempo configuration is via environment variables (no fallback to MCP):

```bash
# Add to .env file in project root

# Required: Tempo API Bearer Token
# Get from: Tempo > Settings > API Integration
TT_TEMPO_API_TOKEN="your-tempo-api-token"

# Required: Your Atlassian Account ID
# Find via: curl -u email:token https://your-domain.atlassian.net/rest/api/3/myself | jq -r '.accountId'
TT_ATLASSIAN_ACCOUNT_ID="5b10a2844c20165700ede21g"
```

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `TT_TEMPO_API_TOKEN` | **Yes** | - | Tempo API Bearer Token |
| `TT_ATLASSIAN_ACCOUNT_ID` | **Yes** | - | Your Atlassian Account ID for authorAccountId |

> **Note:** `base_url` is configured directly in `opencode-project.json` (project config), not as an environment variable. Default: `https://api.tempo.io`, EU: `https://api.eu.tempo.io`.

### How to Find Your Atlassian Account ID

**Option 1: Via Jira REST API (recommended)**
```bash
curl -s -u your-email@company.com:YOUR_API_TOKEN \
  https://your-domain.atlassian.net/rest/api/3/myself \
  | jq -r '.accountId'
```

**Option 2: Via Browser**
1. Go to your Jira profile
2. Look at the URL: `https://your-domain.atlassian.net/jira/people/{accountId}`

### Configuration File Reference

Optional config in `.opencode/opencode-project.json`:

```json
{
  "time_tracking": {
    "sync": {
      "tempo": {
        "api_token": "{env.TT_TEMPO_API_TOKEN}",
        "base_url": "https://api.tempo.io",
        "atlassian_account_id": "{env.TT_ATLASSIAN_ACCOUNT_ID}"
      }
    }
  }
}
```

## Tempo REST API v4

### Base URL

- **Default:** `https://api.tempo.io`
- **EU:** `https://api.eu.tempo.io`

### Authentication

```
Authorization: Bearer {TT_TEMPO_API_TOKEN}
Content-Type: application/json
```

### Endpoints

| Action | Method | Endpoint | Description |
|--------|--------|----------|-------------|
| Create | POST | `/4/worklogs/` | Create new worklog |
| Get | GET | `/4/worklogs/{id}` | Get worklog by ID |
| Update | PUT | `/4/worklogs/{id}` | Update existing worklog |
| Delete | DELETE | `/4/worklogs/{id}` | Delete worklog |

### WorklogInput (Create/Update Payload)

```json
{
  "authorAccountId": "5b10a2844c20165700ede21g",
  "issueId": 10001,
  "startDate": "2026-01-30",
  "startTime": "08:40:00",
  "timeSpentSeconds": 1800,
  "description": "Task description",
  "attributes": [
    {
      "key": "_Account_",
      "value": "TD_KS_1100"
    }
  ]
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `authorAccountId` | string | Yes | Atlassian Account ID of the worker |
| `issueId` | integer | Yes | JIRA Issue ID (numeric, NOT issue key!) |
| `startDate` | string | Yes | Date in `YYYY-MM-DD` format |
| `startTime` | string | No | Time in `HH:mm:ss` format |
| `timeSpentSeconds` | integer | Yes | Duration in seconds |
| `description` | string | No | Worklog description |
| `attributes` | array | No | Work attributes (e.g., Account) |

### Worklog Response

```json
{
  "tempoWorklogId": 12345,
  "issue": { "id": 10001, "key": "SOSO-286" },
  "author": { "accountId": "5b10a2844c20165700ede21g" },
  "startDate": "2026-01-30",
  "startTime": "08:40:00",
  "timeSpentSeconds": 1800,
  "description": "Task description",
  "createdAt": "2026-01-30T09:00:00.000Z",
  "updatedAt": "2026-01-30T09:00:00.000Z"
}
```

**Important:** The `tempoWorklogId` from the response is stored in the CSV for updates/deletes.

### Issue Key to Issue ID Mapping

The Tempo API requires `issueId` (numeric), but the CSV has `issue_key` (e.g., "SOSO-286").

**Mapping via Jira API:**
```
mcp_atlassian_getJiraIssue({ issueIdOrKey: "SOSO-286" })
  → response.id = "10001"
```

**Caching:** Build a cache of all unique issue_keys before processing to minimize API calls.

## Extended CSV Schema

The booking-proposal CSV includes columns for Tempo sync tracking:

```csv
...,tempo_worklog_id,tempo_sync_status,tempo_response_message
```

| Column | Type | Description |
|--------|------|-------------|
| `tempo_worklog_id` | string | Tempo worklog ID after successful sync |
| `tempo_sync_status` | enum | Current sync status |
| `tempo_response_message` | string | API response or error message |

### Sync Status Values

| Status | Meaning | Sync Action |
|--------|---------|-------------|
| `waiting` | New entry, not yet synced | CREATE |
| `in_progress` | Currently being synced | SKIP |
| `success` | Successfully synced | UPDATE |
| `error` | Sync failed | Retry (CREATE or UPDATE) |
| `deleted` | Marked for deletion | DELETE, then remove row |

### Status Flow

```
┌─────────────────────────────────────────────────────────────────┐
│  New entry (from booking-proposal)                              │
│       │                                                         │
│       ▼                                                         │
│  tempo_sync_status = "waiting"                                  │
│  tempo_worklog_id = ""                                          │
│       │                                                         │
│       ▼  (sync-tempo starts)                                    │
│  tempo_sync_status = "in_progress"                              │
│       │                                                         │
│       ├──► Success:                                             │
│       │    tempo_sync_status = "success"                        │
│       │    tempo_worklog_id = "12345"                           │
│       │    tempo_response_message = "Created worklog 12345"     │
│       │                                                         │
│       └──► Error:                                               │
│            tempo_sync_status = "error"                          │
│            tempo_worklog_id = ""                                │
│            tempo_response_message = "Issue not found"           │
└─────────────────────────────────────────────────────────────────┘
```

## Sync Workflow

### 1. Validate Configuration

Read config from `opencode-project.json` and resolve `{env.VAR}` patterns:

```
1. Read `.opencode/opencode-project.json` under `time_tracking.sync.tempo`
2. For values with pattern `{env.VARIABLE_NAME}` (api_token, atlassian_account_id):
   - Extract variable name (e.g., TT_TEMPO_API_TOKEN)
   - Try to resolve:
     a) First check system environment: `echo $VARIABLE_NAME`
     b) If empty, read from `.env` file: `grep "^VARIABLE_NAME=" .env | cut -d'=' -f2`
   - Replace pattern with resolved value
3. Read `base_url` directly (project config value, not an env reference)
```

**Validation:**
- If `api_token` empty after resolution: Error "TT_TEMPO_API_TOKEN not configured"
- If `atlassian_account_id` empty after resolution: Error "TT_ATLASSIAN_ACCOUNT_ID not configured"
- If `base_url` empty: Use default `https://api.tempo.io`

### 2. Load Booking Proposal CSV

```
Path: .opencode/time_tracking/bookings/booking-proposal-{date}.csv
```

**Validation:**
- If file not found: Error "Booking proposal not found. Run /time-tracking.booking-proposal first"

### 3. Validate All Entries Have issue_key

```
For each entry:
  IF issue_key is empty:
    → ABORT with error
    → "Entry at {from}-{to} has no issue_key. All entries must have an issue_key for Tempo sync."
```

**Important:** One missing issue_key aborts the entire sync.

### 4. Build Issue ID Cache

```
1. Collect all unique issue_key values from CSV
2. For each issue_key:
   - Call mcp_atlassian_getJiraIssue({ issueIdOrKey: issue_key })
   - Extract numeric "id" from response
   - Store in cache: issue_key → issue_id
3. If any issue not found: Error "Issue not found: {issue_key}"
```

### 5. Process Entries

For each entry in the CSV:

```
SWITCH tempo_sync_status:

CASE "in_progress":
  → SKIP (already being processed)

CASE "deleted":
  IF tempo_worklog_id exists:
    → Call sync-tempo-worklog(action: "delete")
    → If success: Mark row for removal
    → If error: Set status = "error", save message
  ELSE:
    → Mark row for removal (nothing to delete in Tempo)

CASE "waiting", "error", "" (empty):
  → Set status = "in_progress" (in memory)
  → Call sync-tempo-worklog(action: "create", ...)
  → If success:
      status = "success"
      tempo_worklog_id = response.tempo_worklog_id
      message = "Created worklog {id}"
  → If error:
      status = "error"
      message = error message

CASE "success":
  IF tempo_worklog_id exists:
    → Set status = "in_progress" (in memory)
    → Call sync-tempo-worklog(action: "update", ...)
    → If success: status = "success", message = "Updated worklog {id}"
    → If error: status = "error", message = error
  ELSE:
    → Treat as "waiting" (CREATE instead of UPDATE)
```

### 6. Save CSV

After processing ALL entries:

1. Remove rows marked for deletion (status = "deleted" + successfully deleted)
2. Update all other rows with new values
3. Write CSV back to file

### 7. Output Summary

```markdown
## Tempo Sync: 2026-01-30

| Status | Ticket | Time | Tempo ID | Message |
|--------|--------|------|----------|---------|
| ✓ CREATE | SOSO-286 | 08:40-09:15 | 12345 | Created worklog 12345 |
| ✓ UPDATE | SOSO-286 | 09:15-10:00 | 12346 | Updated worklog 12346 |
| ✗ ERROR | SOSO-999 | 10:00-10:30 | - | Issue not found |
| ⊘ SKIP | SOSO-123 | 10:30-11:00 | 12347 | in_progress |
| ✓ DELETE | SOSO-456 | 11:00-11:30 | 12348 | Deleted worklog 12348 |

**Summary:**
- Created: 2
- Updated: 1
- Deleted: 1
- Errors: 1
- Skipped: 1

**CSV updated:** .opencode/time_tracking/bookings/booking-proposal-2026-01-30.csv
```

## Custom Tool: sync-tempo-worklog

The sync uses a custom tool for Tempo API calls.

**Important:** The tool cannot access `process.env`. The agent must read credentials from `.env` (via `opencode-project.json` config) and pass them as arguments.

### Tool Interface

```typescript
// Input
{
  action: "create" | "update" | "delete",
  
  // REQUIRED - Agent reads from .env and passes:
  tempo_api_token: string,    // From TT_TEMPO_API_TOKEN
  author_account_id: string,  // From TT_ATLASSIAN_ACCOUNT_ID
  
  // OPTIONAL:
  tempo_base_url?: string,    // From config base_url (default: https://api.tempo.io)
  
  // For CREATE/UPDATE:
  issue_id: number,           // JIRA Issue ID (numeric)
  start_date: string,         // YYYY-MM-DD
  start_time: string,         // HH:mm:ss
  duration_seconds: number,   // Duration in seconds
  description?: string,       // Worklog description
  account_key?: string,       // Tempo Account Key
  
  // For UPDATE/DELETE:
  tempo_worklog_id?: string   // Tempo Worklog ID
}

// Output
{
  success: boolean,
  action: string,
  tempo_worklog_id?: string,  // For CREATE: new ID
  message: string             // Success or error message
}
```

### How Agent Reads Credentials

1. Read config from `opencode-project.json`:
   ```json
   {
     "time_tracking": {
       "sync": {
         "tempo": {
            "api_token": "{env.TT_TEMPO_API_TOKEN}",
            "base_url": "https://api.tempo.io",
            "atlassian_account_id": "{env.TT_ATLASSIAN_ACCOUNT_ID}"
         }
       }
     }
   }
   ```

2. Resolve `{env.VAR}` placeholders for `api_token` and `atlassian_account_id`:
   - First try system environment: `echo $TT_TEMPO_API_TOKEN`
   - If empty, read from `.env`: `grep "^TT_TEMPO_API_TOKEN=" .env | cut -d'=' -f2`
3. Read `base_url` directly from config (not an env reference)

4. Pass resolved values to tool call

### Duration Calculation

Convert `duration_hours` from CSV to seconds:

```javascript
duration_seconds = Math.round(duration_hours * 3600)
```

### Start Time Format

Convert `from` column to required format:

```javascript
// CSV has: "08:40"
// API needs: "08:40:00"
start_time = from + ":00"
```

## Error Handling

### Validation Errors (Abort)

| Error | Cause | Resolution |
|-------|-------|------------|
| Missing API token | `TT_TEMPO_API_TOKEN` not set | Set in `.env` |
| Missing Account ID | `TT_ATLASSIAN_ACCOUNT_ID` not set | Set in `.env` |
| Missing issue_key | Entry without ticket | Fix booking proposal |
| Issue not found | Invalid issue_key | Check JIRA |

### API Errors (Per-Entry)

| HTTP Status | Meaning | Action |
|-------------|---------|--------|
| 400 | Invalid request | Check payload format |
| 401 | Unauthorized | Check API token |
| 403 | Forbidden | Check permissions |
| 404 | Worklog not found | Entry may be deleted in Tempo |

### Partial Success

- All successful entries are saved to CSV
- Failed entries are marked with `status = "error"`
- Re-running sync will retry failed entries

## Account Key as Work Attribute

The `account_key` from the CSV is sent as a Tempo Work Attribute:

```json
{
  "attributes": [
    {
      "key": "_Account_",
      "value": "TD_KS_1100"
    }
  ]
}
```

**Note:** The attribute key `_Account_` is hardcoded. This must match the Work Attribute configuration in Tempo.

## Re-Sync Behavior

| Current Status | Has tempo_worklog_id | Action |
|----------------|---------------------|--------|
| `waiting` | No | CREATE |
| `in_progress` | - | SKIP |
| `success` | Yes | UPDATE (always, even if no change detected) |
| `success` | No | CREATE (shouldn't happen) |
| `error` | No | CREATE (retry) |
| `error` | Yes | UPDATE (retry) |
| `deleted` | Yes | DELETE, then remove row |
| `deleted` | No | Remove row |

**Note:** UPDATE is always sent for `success` entries, even if no change is detected. This ensures Tempo is always in sync.

## Sync-ID Preservation

When regenerating a booking proposal with `/time-tracking.booking-proposal`:

1. Check if `booking-proposal-{date}.csv` exists
2. Load existing Tempo sync data:
   - `tempo_worklog_id`
   - `tempo_sync_status`
   - `tempo_response_message`
3. Match entries by `(from, to, issue_key)` triple
4. Preserve sync data for matched entries
5. New entries get `tempo_sync_status = "waiting"`

This prevents duplicate worklogs when regenerating proposals.

## Limitations

- **No Bulk API:** Sequential processing for better error handling
- **No billableSeconds:** Field is locked in Tempo configuration
- **Account Key fixed:** Uses `_Account_` attribute key (not configurable)

## References

- **Tempo REST API v4:** https://apidocs.tempo.io
- **`time-tracking-csv`** - CSV format and field definitions
- **`time-tracking-booking`** - Booking proposal generation
- **`/time-tracking.booking-proposal`** - Generate booking CSV
- **`/time-tracking.sync-tempo`** - Sync to Tempo
- **`@tempo-sync`** - Agent for Tempo synchronization
