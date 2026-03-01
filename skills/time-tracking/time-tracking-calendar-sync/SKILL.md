---
name: time-tracking-calendar-sync
description: This skill should be used when the user asks to "sync time tracking to calendar", "push bookings to calendar", "sync worklogs to google calendar", "create calendar events from bookings", or needs guidance on calendar synchronization for time tracking booking proposals.
---

# Time Tracking Calendar Sync

## Overview

Synchronizes booking proposals with Google Calendar using a two-calendar system:
- **Source Calendar:** Primary calendar with real meetings (read-only)
- **Booking Calendar:** Target calendar for time tracking entries (write)

**Pipeline:**
```
booking-proposal-{date}.csv
         │
         ▼
/time-tracking.sync-calendar
         │
         ▼
┌────────────────────────────────────┐
│   Google Calendar (Booking)        │
│   - CREATE new events              │
│   - UPDATE changed events          │
│   - DELETE removed events          │
└────────────────────────────────────┘
```

## When to Use This Skill

- Sync booking proposals to Google Calendar
- Create calendar events from time tracking data
- Update existing booking events after changes
- Clean up orphaned calendar events

## Configuration

### Environment Variables

Personal calendar IDs should be set via environment variables to avoid committing sensitive data:

```bash
# Add to .env file in project root
TT_SOURCE_CALENDAR_ID="your-email@company.com"
TT_BOOKING_CALENDAR_ID="c_abc123@group.calendar.google.com"
```

| Variable | Required | Description |
|----------|----------|-------------|
| `TT_SOURCE_CALENDAR_ID` | No | Primary calendar with meetings (read-only) |
| `TT_BOOKING_CALENDAR_ID` | **Yes** | Target calendar for booking events (write) |

### Configuration File with Env References

The configuration file uses `{env.VARIABLE_NAME}` syntax to reference environment variables:

```json
{
  "time_tracking": {
    "sync": {
      "calendar": {
        "source_calendar_id": "{env.TT_SOURCE_CALENDAR_ID}",
        "booking_calendar_id": "{env.TT_BOOKING_CALENDAR_ID}",
        "ticket_pattern": "([A-Z]+-\\d+)",
        "account_pattern": "(TD_[A-Z0-9_]+)",
        "jira_base_url": "https://company.atlassian.net/browse",
        "filter": {
          "exclude_title_patterns": ["^\\[PRIVAT\\]"],
          "require_attendees": false,
          "require_accepted": true,
          "exclude_all_day": true
        }
      }
    }
  }
}
```

### Event Filter Configuration

The `filter` section controls which calendar events are included in booking proposals:

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `exclude_title_patterns` | `string[]` | `[]` | Regex patterns (case-insensitive) to exclude by title |
| `require_attendees` | `boolean` | `false` | Only include events with attendees |
| `require_accepted` | `boolean` | `true` | Only include events user has accepted |
| `exclude_all_day` | `boolean` | `true` | Exclude all-day events |

**Example:** To exclude private appointments and focus time:
```json
"exclude_title_patterns": ["^\\[PRIVAT\\]", "^\\[PERSONAL\\]", "Fokuszeit"]
```

For detailed filter logic, see **`time-tracking-booking`** skill.

### Env Reference Syntax

**Format:** `{env.VARIABLE_NAME}`

**Resolution by Agents:**
1. Agent reads config value
2. Detects `{env.*}` pattern
3. Extracts variable name (e.g., `TT_SOURCE_CALENDAR_ID`)
4. Resolves value with fallback:
   - **First:** Check system environment variable (`echo $VARIABLE_NAME`)
   - **Fallback:** If empty, read from `.env` file in project root
5. Replaces pattern with resolved value

**Reading from .env file:**
```bash
# Check system env first
value=$(echo $TT_SOURCE_CALENDAR_ID)

# Fallback to .env file if empty
if [ -z "$value" ] && [ -f .env ]; then
  value=$(grep "^TT_SOURCE_CALENDAR_ID=" .env | cut -d'=' -f2)
fi
```

**Why this order?**
- System environment takes precedence (allows CI/CD overrides)
- `.env` file provides developer-friendly local configuration
- `.env` should be in `.gitignore` to avoid committing sensitive data

**Behavior when variable not set:**
- `source_calendar_id`: Warning, continue without calendar integration
- `booking_calendar_id`: Error, sync cannot proceed

### Configuration Reference

| Field | Env Variable | Description |
|-------|--------------|-------------|
| `source_calendar_id` | `TT_SOURCE_CALENDAR_ID` | Primary calendar with real meetings (for booking-proposal integration) |
| `booking_calendar_id` | `TT_BOOKING_CALENDAR_ID` | Target calendar where booking events are created |
| `ticket_pattern` | - | Regex to extract ticket from calendar event description |
| `account_pattern` | - | Regex to extract account key from calendar event description |
| `jira_base_url` | - | Base URL for JIRA ticket links in event description |
| `filter` | - | Event filter configuration (see above) |

## Extended CSV Schema

The booking-proposal CSV includes additional columns for sync tracking:

```csv
date_from,date_to,issue_key,account_key,from,to,duration_hours,raw_hours,tokens,description,source,source_event_id,booking_event_id
```

| Column | Description |
|--------|-------------|
| `source` | `csv` (from time tracking) or `calendar` (from source calendar) |
| `source_event_id` | Original event ID from source calendar (only for source=calendar) |
| `booking_event_id` | Created event ID in booking calendar (after sync, only for source=csv) |

## Sync Workflow

### 1. Load Data

```
1. Read booking-proposal-{date}.csv
2. Read existing events from booking_calendar_id for the date
3. Build mapping: booking_event_id → existing event
```

### 2. Process Entries

For each entry in the booking proposal:

```
IF source = "calendar":
  → SKIP (already exists in source calendar)

IF source = "csv":
  IF booking_event_id is empty:
    → CREATE new event in booking calendar
    → Save returned event_id to CSV
    
  IF booking_event_id exists:
    → Fetch existing event
    → Compare: title, start, end, description
    → IF changed: UPDATE event
    → IF unchanged: SKIP
```

### 3. Cleanup Orphaned Events

Events that exist in the booking calendar but are not in the current proposal:

```
1. Find events in booking calendar for the date
2. Compare with booking_event_ids in CSV
3. Orphaned = events not referenced in CSV
4. ASK USER: "Delete X orphaned events? [list events]"
5. IF confirmed: DELETE orphaned events
```

### 4. Update CSV

Write back the CSV with updated `booking_event_id` values.

## Same vs. Different Calendar Sync

The sync behavior depends on whether source and booking calendars are identical:

| Scenario | source=csv | source=calendar |
|----------|------------|-----------------|
| Source == Booking | CREATE/UPDATE | SKIP (would be duplicate) |
| Source != Booking | CREATE/UPDATE | CREATE/UPDATE (copy to booking) |

**Typical configuration:**
- `source_calendar_id`: Personal calendar (read meetings)
- `booking_calendar_id`: Team calendar or separate booking calendar

When calendars are different, **all** entries (csv + calendar) are synced to the booking calendar, providing a complete overview of booked time in one place.

**Logic in agent:**
```
same_calendar = (source_calendar_id == booking_calendar_id)

IF source = "calendar":
  IF same_calendar:
    → SKIP
  ELSE:
    → CREATE/UPDATE in booking_calendar_id
```

## Event Format

### Title

```
[{ISSUE_KEY}] {Description}
```

Examples:
- `[SOSO-286] Time-Tracking Booking-Proposal implementiert`
- `[PMO-31] PMO Jour Fixe Stakeholder`

For entries without ticket:
- `[-] Team-Meetings und Koordination`

### Description

```
{Description}

Issue: {ISSUE_KEY}
Account: {ACCOUNT_KEY}
Raw Hours: {RAW_HOURS}h
Tokens: {TOKENS}
Link: {JIRA_BASE_URL}/{ISSUE_KEY}
```

Example:
```
Time-Tracking Booking-Proposal implementiert

Issue: SOSO-286
Account: TD_KS_1100_KI_Arbeitsweise
Raw Hours: 0.28h
Tokens: 44,878
Link: https://techdivision.atlassian.net/browse/SOSO-286
```

For entries without ticket, omit the Issue and Link lines.

### Event Attributes

| Attribute | Value | Description |
|-----------|-------|-------------|
| `summary` | `[TICKET] Description` | Event title |
| `start_time` | RFC3339 datetime | From `from` column |
| `end_time` | RFC3339 datetime | From `to` column |
| `description` | Formatted text | See format above |
| `transparency` | `"transparent"` | Shows as "Free" (not blocking time) |

## Change Detection

Changes are detected by comparing the current CSV entry with the existing calendar event:

| Field | Comparison |
|-------|------------|
| Title | `[{issue_key}] {description}` |
| Start time | `from` column |
| End time | `to` column |
| Description | Full formatted description |

If any field differs → UPDATE the event.

## Error Handling

- **API Error:** Abort immediately and report error
- **Missing Config:** Report "Please configure sync.calendar in opencode-project.json"
- **Missing CSV:** Report "Please run /time-tracking.booking-proposal first"

## Example Sync Output

```markdown
## Calendar Sync: 2026-01-29

| Action | Ticket | Time | Description |
|--------|--------|------|-------------|
| CREATE | SOSO-286 | 08:15-08:35 | Time-Tracking impl |
| CREATE | SOSO-3 | 08:35-08:40 | JF Philipp/Tim |
| SKIP | - | 09:30-10:00 | JF Philipp & Tim (source=calendar) |
| UPDATE | PMO-31 | 14:00-14:25 | PMO Jour Fixe (time changed) |

**Summary:**
- Created: 2 events
- Updated: 1 event
- Skipped: 1 entry (source=calendar)
- Deleted: 0 events

**CSV updated:** .opencode/time_tracking/bookings/booking-proposal-2026-01-29.csv
```

## Integration with Booking-Proposal

The `/time-tracking.booking-proposal` command integrates calendar events:

### Calendar Event Filtering

When `source_calendar_id` is configured:

1. Fetch events for the target date
2. Filter criteria:
   - User's response status = `accepted`
   - NOT all-day events (must have `dateTime`, not just `date`)
3. For each event:
   - Extract `issue_key` using `ticket_pattern` from description
   - Extract `account_key` using `account_pattern` from description
   - Use `global_default.account_key` as fallback
   - Set `source = "calendar"`
   - Set `source_event_id = event.id`

### Merge Logic

```
1. Calendar events are "fixed" (exact times preserved)
2. CSV worklogs fill gaps sequentially
3. Overlap allowed: CSV entries can run parallel to calendar events
4. Lunch break only applies to CSV worklogs, not calendar events
```

### Event-ID Preservation

When regenerating a booking proposal:

```
1. Check if booking-proposal-{date}.csv exists
2. Load existing booking_event_id values
3. Match entries by (from, to, issue_key)
4. Preserve booking_event_id for matched entries
```

This ensures that `/sync-calendar` can UPDATE existing events instead of creating duplicates.

## Google Workspace MCP Tools

The sync uses these MCP tools:

| Tool | Purpose |
|------|---------|
| `google-workspace-mcp_get_events` | Read events from calendar |
| `google-workspace-mcp_create_event` | Create new booking event |
| `google-workspace-mcp_modify_event` | Update existing event |
| `google-workspace-mcp_delete_event` | Delete orphaned event |

### Create Event Parameters

```javascript
{
  calendar_id: config.booking_calendar_id,
  summary: "[SOSO-286] Description",
  start_time: "2026-01-29T08:15:00+01:00",
  end_time: "2026-01-29T08:35:00+01:00",
  description: "...",
  transparency: "transparent"  // Shows as "Free"
}
```

## Limitations

The Google Workspace MCP tool does not support:
- `visibility` (private/confidential) - events are default visibility
- `colorId` - events use default calendar color

## References

- **`time-tracking-csv`** - CSV format and field definitions
- **`time-tracking-booking`** - Booking proposal generation
- **`/time-tracking.booking-proposal`** - Generate booking CSV
- **`/time-tracking.sync-calendar`** - Sync to Google Calendar
- **`@calendar-sync`** - Agent for calendar synchronization
