---
description: Prepare time entries for worklog synchronization
---

# Sync Worklogs

Prepare time tracking entries and calendar events for worklog synchronization.

## Skill Reference

- **`time-tracking-csv`** - CSV format, rounding rules, consolidation logic

## Task

### 1. Parse the date range

- Ask user for date range (default: previous workday)
- Previous workday calculation: `date -v-1d +"%Y-%m-%d"`
- Support single date or date range (start_date - end_date)

### 2. Read time tracking entries

- Read `.opencode/opencode-project.json` to get `time_tracking.csv_file` path
- If config doesn't exist or `time_tracking` section is missing, tell user to run `/time-tracking.init` first
- Read all entries from configured CSV file
- Filter entries by date range (match `start_date` field)
- Parse each entry and extract:
  - issue_key
  - account_key
  - start_date (use as date)
  - start_time (HH:MM:SS format)
  - duration_seconds
  - description
  - ticket_name

### 3. Convert entries to worklog format

- For each time tracking entry, create worklog entry:
  - **date:** Use start_date (YYYY-MM-DD)
  - **start_time:** Convert HH:MM:SS to HH:MM, round to nearest 5 minutes
  - **duration:** Convert duration_seconds to hours (seconds / 3600), round to nearest 5 minutes (0.0833h increments)
  - **issue_key:** Keep as-is
  - **account_key:** Keep as-is
  - **description:** Keep as-is
  - **calendar_event_id:** Empty (will be filled from calendar if match found)
  - **source:** "time-tracking"

### 4. Fetch Google Calendar events

- Use google-workspace-mcp to fetch calendar events for date range
- For each calendar event, extract:
  - event_id
  - start_time
  - end_time
  - duration (in hours)
  - title/summary
- Round times to nearest 5 minutes
- Create worklog entries with:
  - **calendar_event_id:** event_id
  - **start_time:** Rounded start time
  - **duration:** Rounded duration in hours
  - **description:** Event title
  - **source:** "calendar"
  - **issue_key:** Empty (to be matched/filled)
  - **account_key:** Empty (to be matched/filled)

### 5. Combine and sort all entries

- Combine both lists (time-tracking + calendar)
- Sort by date and start_time chronologically
- **IMPORTANT: Do NOT merge overlapping entries (same start_time)**
- Keep all entries separate if they have the same start_time
- Allow temporal overlaps (e.g., two entries at 13:30)

### 6. Consolidate sequential same-ticket entries

- After sorting, scan for consecutive entries with same issue_key
- **Consolidation Rules:**
  - Merge ONLY if entries are consecutive (no other entries in between)
  - Merge ONLY if issue_key is not empty and matches
  - Start time: Use earliest start_time
  - Duration: Sum all durations
  - Description: Combine descriptions (separated by " + ")
  - Account: Keep from first entry
  - Source: "time-tracking" (consolidated entries always from tracking)
  - Status: "pending"
- **Example:**
  - Entry 1: 13:30, 0.75h, STORY-7.6, "Admin API"
  - Entry 2: 14:25, 0.33h, STORY-7.6, "Ticket complete"
  - Result: 13:30, 1.08h, STORY-7.6, "Admin API + Ticket complete"
- Create chronological timeline with consolidated ticket work

### 7. Save to sync CSV file

- Create/overwrite `~/time_tracking/worklogs-sync.csv`
- **CSV Schema:** `date,start_time,duration_hours,issue_key,account_key,calendar_event_id,description,source,sync_status`
- Write all worklog entries (consolidated + calendar) in chronological order
- **sync_status:** "pending" (ready to sync), "draft" (needs review/assignment)

### 8. Output the summary

- Show user:
  - Date range processed
  - Total time-tracking entries: X (before consolidation)
  - Consolidated ticket entries: Y (sequential same-ticket entries merged)
  - Total calendar events: Z
  - Temporal overlaps: N (entries with same start_time)
  - Total worklogs: M (after consolidation)
  - Total duration: HH:MM hours
  - File saved to: time_tracking/worklogs-sync.csv
- List all entries in table format (chronologically sorted)
- Highlight consolidated entries
- Highlight temporal overlaps if any
- Ask user if they want to proceed with sync (will be implemented in future command)

## Worklog CSV Format

```csv
date,start_time,duration_hours,issue_key,account_key,calendar_event_id,description,source,sync_status
```

**Example Entries:**
```csv
# Consolidated entry (2 sequential time-tracking entries for STORY-7.6 merged)
"2025-11-10","13:30",1.08,"STORY-7.6","TD_KS_1100_SYSTEM_SERVICE_PORTFOLIO","","Story 7.6: Admin Session Management API + /ticket-complete workflow execution","time-tracking","pending"

# Calendar entry at same time (temporal overlap - NOT merged)
"2025-11-10","13:30",0.42,"","TD_KS_1100_SYSTEM_SERVICE_PORTFOLIO","cal_abc123","Tim / Susanne Jour Fixe","calendar","draft"

# Regular calendar entry
"2025-11-10","14:00",0.5,"","TD_KS_1100_SYSTEM_SERVICE_PORTFOLIO","cal_def456","Jour Fixe Tim / Sabine","calendar","draft"
```

**Notes:**
- First entry: Consolidated from 2 sequential STORY-7.6 entries (0.75h + 0.33h = 1.08h)
- Temporal overlap at 13:30 preserved (consolidated ticket + calendar meeting)
- Calendar entries remain separate

## Rounding Rules

See skill **`time-tracking-csv`** for detailed rounding rules.

**Summary:**
- Round times to 5-minute precision (09:03 → 09:05)
- Round duration to 5-minute units (94 min → 95 min → 1.5833h)

## Important Notes

- **NO actual sync yet:** This command only PREPARES the data
- **Review required:** User should review worklogs-sync.csv before actual sync
- **Consolidation:** Sequential entries with same issue_key are merged
- **NO temporal merging:** Entries with same start_time stay separate
- **Chronological order:** Entries sorted by start_time before consolidation
- **Preserve original:** Never modify original time-tracking.csv
- **Temporal overlaps:** Multiple entries at same time are allowed and preserved

## Consolidation Examples

**Will be consolidated (sequential same ticket):**
```
13:30 - 0.75h - STORY-7.6 - "Admin API"
14:25 - 0.33h - STORY-7.6 - "Ticket complete"
→ Result: 13:30 - 1.08h - STORY-7.6 - "Admin API + Ticket complete"
```

**Will NOT be consolidated (different tickets or not sequential):**
```
13:30 - 0.75h - STORY-7.6 - "Admin API"
13:30 - 0.42h - [no ticket] - "Team Meeting"  (temporal overlap, different tickets)
→ Both entries preserved
```

```
13:30 - 0.75h - STORY-7.6 - "Admin API"
14:00 - 0.50h - [no ticket] - "Meeting"  (other entry in between)
14:25 - 0.33h - STORY-7.6 - "Ticket complete"
→ All three entries preserved (not sequential)
```

**Tone:** Efficient, clear, helpful
