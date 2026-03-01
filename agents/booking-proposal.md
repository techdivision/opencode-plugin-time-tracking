---
description: Generates booking proposal CSV from cumulated time entries with optional calendar integration
mode: subagent
temperature: 0.3
tools:
  cumulate-daily-worklogs: true
  google-workspace-mcp_get_events: true
  write: true
  read: true
  bash: true
---

# Booking Proposal Agent

Generate booking proposal CSV files from time tracking entries. Cumulates entries per ticket, applies rounding, handles lunch breaks, and creates value-oriented descriptions.

## Input

Arguments in format: `[period]`

| Input | Meaning |
|-------|---------|
| (empty) / `today` | Today's date |
| `yesterday` | Yesterday's date |
| `YYYY-MM-DD` | Specific date |
| `YYYY-MM-DD YYYY-MM-DD` | Date range (max 31 days) |

## Workflow

### 1. Parse Period

Determine the date(s) to process:

```bash
# Today
date +"%Y-%m-%d"

# Yesterday (macOS)
date -v-1d +"%Y-%m-%d"
```

**Validation:**
- Range > 31 days: Error "Maximum 31 days. Please choose a shorter period."
- End date before start date: Error "End date must be after start date."
- Invalid date format: Error "Invalid date format. Use YYYY-MM-DD."

### 2. Read Configuration

Read `.opencode/opencode-project.json` and extract:

```json
{
  "time_tracking": {
    "bookings_dir": ".opencode/time_tracking/bookings/",
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

**Defaults:**
- `bookings_dir`: `.opencode/time_tracking/bookings/`
- `rounding_minutes`: `5`
- `lunch_break.start`: `"12:00"`
- `lunch_break.end`: `"13:00"`

Create `bookings_dir` if it doesn't exist:
```bash
mkdir -p .opencode/time_tracking/bookings/
```

### 2a. Load Existing Sync IDs (Optional)

**Purpose:** When regenerating a booking proposal, preserve sync IDs from the existing CSV so that sync commands can UPDATE instead of creating duplicates.

**Preserved fields:**
- `booking_event_id` - Google Calendar event ID (from `/sync-calendar`)
- `tempo_worklog_id` - Tempo worklog ID (from `/sync-tempo`)
- `tempo_sync_status` - Tempo sync status
- `tempo_response_message` - Tempo API response message

**Steps:**

1. Check if `{bookings_dir}/booking-proposal-{date}.csv` exists
2. **If file does NOT exist:** Skip this step, continue with empty IDs
3. **If file exists:**
   - Read and parse the CSV
   - Build lookup map: key = `{from}_{to}_{issue_key}` → value = `{ booking_event_id, tempo_worklog_id, tempo_sync_status, tempo_response_message }`
   - Store this map for use in step 8 (Write CSV)

**Example lookup map:**
```
"08:15_09:30_SOSO-286" → { 
  booking_event_id: "abc123event", 
  tempo_worklog_id: "12345",
  tempo_sync_status: "success",
  tempo_response_message: "Created worklog 12345"
}
"09:30_09:35_SOSO-3" → { 
  booking_event_id: "def456event", 
  tempo_worklog_id: "",
  tempo_sync_status: "waiting",
  tempo_response_message: ""
}
```

**Important:** Only preserve IDs where the key matches exactly. Changed times or tickets get new (empty) IDs and `tempo_sync_status = "waiting"`.

### 3. For Each Day: Get Cumulated Data

Call the `cumulate-daily-worklogs` tool:

```
cumulate-daily-worklogs({ date: "YYYY-MM-DD" })
```

Returns:
```json
{
  "date": "2026-01-29",
  "tickets": [
    {
      "issue_key": "SOSO-286",
      "account_key": "TD_KS_1100",
      "first_activity": "08:16:35",
      "total_duration_seconds": 1935,
      "total_tokens": 85394,
      "descriptions": ["Google Calendar Sync", "Booking-Proposal", ...]
    }
  ]
}
```

### 3a. Load Calendar Events (Optional)

**Read config and resolve env references:**

1. Read `.opencode/opencode-project.json` under `time_tracking.sync.calendar`
2. For values matching pattern `{env.VARIABLE_NAME}`:
   - Extract the variable name (e.g., `TT_SOURCE_CALENDAR_ID`)
   - Try to resolve the value:
     1. First check system environment: `echo $VARIABLE_NAME`
     2. If empty, read `.env` file and look for `VARIABLE_NAME=value`
   - Replace the pattern with the resolved value

**Reading .env file:**
```bash
# Read .env if it exists
if [ -f .env ]; then
  grep "^TT_SOURCE_CALENDAR_ID=" .env | cut -d'=' -f2
fi
```

**Example config:**
```json
{
  "time_tracking": {
    "sync": {
      "calendar": {
        "source_calendar_id": "{env.TT_SOURCE_CALENDAR_ID}",
        "booking_calendar_id": "{env.TT_BOOKING_CALENDAR_ID}",
        "ticket_pattern": "([A-Z]+-\\d+)",
        "account_pattern": "(TD_[A-Z0-9_]+)"
      }
    }
  }
}
```

**Check if source calendar is configured:**

After resolving `{env.TT_SOURCE_CALENDAR_ID}`:
- If empty or not set: Output warning "TT_SOURCE_CALENDAR_ID not configured - skipping calendar integration" and continue without calendar events
- If set: Proceed with calendar loading

**Falls konfiguriert, lade Calendar Events:**

```
google-workspace-mcp_get_events({
  calendar_id: <resolved source_calendar_id>,
  time_min: "{date}T00:00:00",
  time_max: "{date}T23:59:59",
  detailed: true
})
```

**Read Filter Configuration:**

Read `time_tracking.sync.calendar.filter` from config with these defaults:

```json
{
  "filter": {
    "exclude_title_patterns": [],
    "require_attendees": false,
    "require_accepted": true,
    "exclude_all_day": true
  }
}
```

| Field | Default | Description |
|-------|---------|-------------|
| `exclude_title_patterns` | `[]` | Regex patterns (case-insensitive) to exclude by title |
| `require_attendees` | `false` | Only include events with attendees |
| `require_accepted` | `true` | Only include events user has accepted |
| `exclude_all_day` | `true` | Exclude all-day events |

**Filter Events (in order):**

For each calendar event, apply filters in this order:

1. **All-day check:** If `exclude_all_day == true` AND event has only `date` (no `dateTime`):
   - SKIP with reason: `"All-day event"`

2. **Accepted check:** If `require_accepted == true` AND `responseStatus != "accepted"`:
   - SKIP with reason: `"Not accepted"`

3. **Attendees check:** If `require_attendees == true` AND attendees is empty/null:
   - SKIP with reason: `"No attendees"`

4. **Title pattern check:** For each pattern in `exclude_title_patterns`:
   - Apply regex with case-insensitive flag: `new RegExp(pattern, 'i')`
   - If pattern matches event summary/title:
     - SKIP with reason: `"Title excluded: matches /{pattern}/i"`

5. If all checks pass: **INCLUDE** the event

**Track skip reasons** for output summary (see step 9).

**Fur jedes inkludierte Event:**
1. `issue_key` extrahieren via `ticket_pattern` aus Titel/Description
2. `account_key` extrahieren via `account_pattern` aus Titel/Description
3. Falls kein Account gefunden: `global_default.account_key` verwenden
4. Setze `source = "calendar"` und `source_event_id = event.id`

### 4. Filter Descriptions

Remove non-meaningful descriptions from each ticket:
- "Greeting", "Quick greeting", "Light greeting"
- "Keine Probleme", "Quick affirmation check"
- Generic acknowledgments

Keep descriptions that describe actual work.

### 5. Merge Calendar Events + CSV Entries

**Falls Calendar Events geladen wurden:**

1. **Calendar Events sind "fixed"** - exakte Zeiten behalten
2. **CSV Entries fullen Lucken** - sequentiell in verfugbare Slots

**Merge-Algorithmus:**

```
Timeline:
  08:00                    12:00         13:00                    17:00
    |                        |             |                        |
    v                        v             v                        v
  [Calendar: Standup 09:00-09:30]      [Calendar: Review 14:00-15:00]
         |                                    |
         v                                    v
  [CSV: 08:15-09:00] [CSV: 09:30-12:00]  [CSV: 13:00-14:00] [CSV: 15:00-...]
```

**Regeln:**
- Calendar Events werden NIE verschoben
- CSV Entries werden nach Calendar Events geschoben bei Uberlappung
- Lunch Break gilt nur fur CSV Entries, nicht fur Calendar Events
- Calendar Events haben `source="calendar"`, CSV Entries haben `source="csv"`

### 6. Calculate Time Blocks

For each entry (Calendar + CSV combined):

**6.1 Round Duration (ceil to rounding_minutes) - nur fur CSV:**
```
raw_minutes = total_duration_seconds / 60
rounded_minutes = ceil(raw_minutes / rounding_minutes) * rounding_minutes
```

Calendar Events behalten ihre exakte Dauer.

**6.2 Determine Start Time:**
- Find earliest activity across all entries (Calendar + CSV)
- Round DOWN to `rounding_minutes`:
```
start_minutes = floor(earliest_minutes / rounding_minutes) * rounding_minutes
```

**6.3 Place Blocks:**
- Calendar Events: Exakte Zeiten, als erstes platzieren
- CSV Entries: Sequentiell in verfugbare Lucken
- For each CSV ticket (sorted by `first_activity`):
  - If block crosses lunch break: split into two blocks
  - If block overlaps with Calendar Event: push after Calendar Event
  - Otherwise: single block
  - Move current time to block end (no gaps between CSV entries)

**6.4 Lunch Break Split (nur CSV):**
When a CSV block crosses `lunch_break.start`:
- Block 1: from current to lunch_break.start
- Block 2: from lunch_break.end with remaining duration
- Both blocks get the SAME description
- Raw hours and tokens are PROPORTIONALLY distributed

### 7. Generate Value-Oriented Descriptions

For each ticket, analyze the filtered descriptions and generate a concise summary (max 80 characters) that:
- Focuses on **outcome/value**, not activities
- Uses technical terms appropriately
- Is suitable for time tracking reports

**Examples:**

| Raw Descriptions | Value-Oriented Summary |
|------------------|------------------------|
| Google Calendar Sync, Booking-Proposal Command, Config pattern matching | Google Calendar Sync und Booking-Proposal Feature implementiert |
| PR Setup, PR Merge, Version Bump, CHANGELOG | Release v0.20.0 published |
| Schema update, API endpoints, Tests | Schema und Admin API implementiert |
| Team call, Alignment, Planning | Team-Meetings und Koordination |

### 8. Write CSV File

**Filename:** `booking-proposal-{YYYY-MM-DD}.csv`

**Schema (with calendar and tempo sync columns):**
```csv
"date_from","date_to","issue_key","account_key","from","to","duration_hours","raw_hours","tokens","description","source","source_event_id","booking_event_id","tempo_worklog_id","tempo_sync_status","tempo_response_message"
```

| Column | Description |
|--------|-------------|
| `source` | `csv` (from time tracking) or `calendar` (from Google Calendar) |
| `source_event_id` | Event ID from source calendar (only for source=calendar) |
| `booking_event_id` | Created event ID in booking calendar (filled by /sync-calendar) |
| `tempo_worklog_id` | Tempo worklog ID (filled by /sync-tempo) |
| `tempo_sync_status` | Tempo sync status: `waiting`, `in_progress`, `success`, `error`, `deleted` |
| `tempo_response_message` | Tempo API response message |

**Rules:**
- All fields in double quotes
- Escape quotes in values: `"` -> `""`
- Empty `issue_key` for "Other" work (entries without ticket)
- `duration_hours` = rounded duration in hours (2 decimals)
- `raw_hours` = proportional raw time in hours (2 decimals)
- `tokens` = proportional token count (integer)
- **Preserve sync IDs:** If lookup map from step 2a has entry for `{from}_{to}_{issue_key}`, use those values; otherwise:
  - `booking_event_id` = empty string
  - `tempo_worklog_id` = empty string
  - `tempo_sync_status` = "waiting"
  - `tempo_response_message` = empty string

Use the `write` tool to create the file.

**Example output (with calendar integration):**
```csv
"date_from","date_to","issue_key","account_key","from","to","duration_hours","raw_hours","tokens","description","source","source_event_id","booking_event_id","tempo_worklog_id","tempo_sync_status","tempo_response_message"
"2026-01-28","2026-01-28","","TD_KS_1100","09:00","09:30","0.50","0.50","0","Team Standup","calendar","event123","","","waiting",""
"2026-01-28","2026-01-28","SOSO-286","TD_KS_1100","09:30","12:00","2.50","1.82","143000","Schema und Admin API implementiert","csv","","","","waiting",""
"2026-01-28","2026-01-28","SOSO-286","TD_KS_1100","13:00","13:30","0.50","0.34","27000","Schema und Admin API implementiert","csv","","","","waiting",""
"2026-01-28","2026-01-28","","TD_KS_1100","13:30","14:00","0.50","0.42","31000","Team-Meetings und Koordination","csv","","","","waiting",""
```

### 9. Output Summary

Display a markdown summary:

```markdown
## Booking Proposal: 2026-01-29

| Ticket | From | To | Duration | Raw | Tokens | Source | Description |
|--------|------|-----|----------|-----|--------|--------|-------------|
| - | 09:00 | 09:30 | 0.50h | 0.50h | 0 | calendar | Team Standup |
| SOSO-286 | 09:30 | 10:05 | 0.58h | 0.54h | 85K | csv | Google Calendar Sync Feature |
| SOSO-3 | 10:05 | 10:10 | 0.08h | 0.07h | 0 | csv | JF Philipp/Tim |

**Total:** 1.17h booked (1.11h raw, 85K tokens)
**Saved to:** .opencode/time_tracking/bookings/booking-proposal-2026-01-29.csv

### Calendar Events Included

Only show this table if calendar integration is active and events were included.

| Event | Time | Ticket |
|-------|------|--------|
| JF Stepan & Tim | 10:15-11:00 | SOSO-286 |
| Lookerstudio | 14:00-14:30 | - |

### Calendar Events Skipped

Only show this table if there are skipped events.

| Event | Reason |
|-------|--------|
| [PRIVAT] Arzttermin | Title excluded: matches /^\[PRIVAT\]/i |
| Zuhause | All-day event |

**CRITICAL: Mutual Exclusivity Rule**

Each calendar event from the API response must appear in **exactly ONE** of these locations:
1. **Booking Proposal Table** (with `source=calendar`) → then list in "Calendar Events Included"
2. **Calendar Events Skipped** → event was filtered out and is NOT in the Booking Proposal

**Never list the same event in both "Included" and "Skipped" tables.**
```

**Source Column:**
- `calendar` = Event from Google Calendar
- `csv` = Entry from time tracking CSV

Format tokens as:
- `< 1000`: raw number
- `>= 1000`: `XXK` (e.g., 85K)
- `>= 1000000`: `X.XM` (e.g., 1.2M)

For multi-day ranges, show summary per day plus overall totals.

---

## Important Notes

- **One CSV per day:** Each day gets its own file
- **Proportional split:** Raw/tokens distributed by duration ratio when split by lunch
- **Rounding from config:** Uses `booking.rounding_minutes` (default: 5)
- **Lunch break from config:** Uses `booking.lunch_break` settings
- **No sync:** This agent only generates CSV files; use sync commands to push to endpoints
- **Overwrite:** Existing files for the same date are overwritten
- **Calendar optional:** Calendar integration only runs if `TT_SOURCE_CALENDAR_ID` is configured
- **Calendar events fixed:** Calendar events keep their exact times, CSV entries fill gaps

## Skills Reference

For detailed specifications, load:
- `time-tracking-csv` - CSV schema, field definitions
- `time-tracking-booking` - Full algorithm details, examples
