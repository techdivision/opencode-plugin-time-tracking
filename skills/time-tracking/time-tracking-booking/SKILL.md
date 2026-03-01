---
name: time-tracking-booking
description: This skill should be used when the user asks to "generate booking suggestions", "consolidate time entries", "create bookable time blocks", "round time entries for booking", "summarize work for timesheet", "create booking proposal CSV", or needs guidance on converting granular time tracking entries into human-readable booking proposals with value-oriented descriptions.
---

# Time Tracking Booking Suggestions

## Overview

Converts granular time tracking entries into bookable time blocks with value-oriented descriptions. The booking suggestion corresponds to what a human would typically book in a time tracking system.

**Core Principle:** Per ticket there is **at most one booking per day**. All activities of a ticket are cumulated and presented as sequential time blocks.

**Pipeline:**
```
┌─────────────────────────────────────────────────────────────────┐
│              /time-tracking.booking-proposal                    │
├─────────────────────────────────────────────────────────────────┤
│   time-tracking.csv        Source Calendar (optional)           │
│         │                        │                              │
│         ▼                        ▼                              │
│   ┌──────────┐            ┌──────────────┐                     │
│   │ Worklogs │            │ Meetings     │                     │
│   │ cumulate │            │ (accepted)   │                     │
│   └────┬─────┘            └──────┬───────┘                     │
│        │  source="csv"           │  source="calendar"          │
│        └──────────┬──────────────┘                             │
│                   ▼                                             │
│          Merge & Schedule                                       │
│          (calendar=fixed, csv=fills gaps)                       │
└─────────────────────────────────────────────────────────────────┘
                    │
                    ▼
         booking-proposal-{date}.csv
                    │
    ┌───────────────┼─────────────────┐
    ↓               ↓                 ↓
/sync-calendar  /sync-tempo      /sync-sheets
    ↓               ↓                 ↓
Google Cal     JIRA/Tempo        Google Sheets
```

## When to Use This Skill

- Create booking suggestions from granular time tracking entries
- Cumulate all entries per ticket to a daily booking
- Generate value-oriented descriptions for bookings
- Round bookings to bookable units (configurable, default: 5 min)
- Generate booking proposal CSV files for sync endpoints
- Integrate calendar meetings into booking proposals

## Daily Cumulation

### Concept

In contrast to block-based grouping, **all entries of a ticket per day** are combined into a single logical booking. The bookings are then presented as **sequential time blocks** without gaps.

### Why Daily Cumulation?

| Block-based (old) | Daily Cumulation (new) |
|-------------------|------------------------|
| Multiple bookings per ticket possible | One booking per ticket per day |
| Actual times (From/To) | Calculated sequential times |
| Gaps between blocks | No gaps (except lunch break) |
| Complex for manual booking | Easy to transfer |

### Ticket Grouping

- Entries with the same `issue_key` are **combined per day**
- Entries without `issue_key` (empty) are grouped as **"Other"**
- Each ticket/Other has exactly one logical booking per day

## Algorithm

### Overview

```
1. CUMULATE per ticket (per day)
2. ROUND the booking duration
3. SORT by first activity
4. DETERMINE start time
5. FILL time blocks sequentially
6. GENERATE description
```

### Step 1: Cumulate per Ticket

```javascript
// Input: All entries of a day
// Output: Map<issue_key, TicketSummary>

const ticketSummaries = new Map();

for (const entry of entries) {
  const key = entry.issue_key || 'Other';
  
  if (!ticketSummaries.has(key)) {
    ticketSummaries.set(key, {
      issue_key: entry.issue_key,
      first_activity: entry.start_time,
      duration_seconds: 0,
      tokens: 0,
      descriptions: []
    });
  }
  
  const summary = ticketSummaries.get(key);
  summary.duration_seconds += entry.duration_seconds;
  summary.tokens += entry.tokens_used || 0;
  summary.descriptions.push(entry.description);
  
  // Track earliest activity
  if (entry.start_time < summary.first_activity) {
    summary.first_activity = entry.start_time;
  }
}
```

### Step 2: Round the Booking Duration

Each cumulated ticket duration is rounded up to the rounding unit.

**Configuration:** Read `booking.rounding_minutes` from `opencode-project.json` (Default: 5)

**Formula:**
```javascript
function roundDuration(durationSeconds, roundingMinutes = 5) {
  const durationMinutes = durationSeconds / 60;
  const roundedMinutes = Math.ceil(durationMinutes / roundingMinutes) * roundingMinutes;
  return roundedMinutes; // in minutes
}
```

**Examples (rounding = 5):**

| Raw Duration | Rounded |
|--------------|---------|
| 0.02h (1 min) | 0.08h (5 min) |
| 0.08h (5 min) | 0.08h (5 min) |
| 0.12h (7 min) | 0.17h (10 min) |
| 0.28h (17 min) | 0.33h (20 min) |
| 1.10h (66 min) | 1.17h (70 min) |

### Step 3: Sort by First Activity

```javascript
const sortedTickets = Array.from(ticketSummaries.values())
  .sort((a, b) => a.first_activity.localeCompare(b.first_activity));
```

### Step 4: Determine Start Time

The start time is the earliest activity of the day, **rounded down** to the rounding unit.

```javascript
function roundDownToInterval(time, intervalMinutes) {
  const [hours, minutes] = time.split(':').map(Number);
  const totalMinutes = hours * 60 + minutes;
  const roundedMinutes = Math.floor(totalMinutes / intervalMinutes) * intervalMinutes;
  const newHours = Math.floor(roundedMinutes / 60);
  const newMins = roundedMinutes % 60;
  return `${String(newHours).padStart(2, '0')}:${String(newMins).padStart(2, '0')}`;
}

// Example: 11:24 → 11:15 (with 15 min rounding)
```

### Step 5: Fill Time Blocks Sequentially

Bookings are placed **without gaps**, considering the lunch break.

**Lunch Break Configuration:** Read from `booking.lunch_break` in `opencode-project.json`
- `start`: Default `"12:00"`
- `end`: Default `"13:00"`

```javascript
function fillTimeBlocks(sortedTickets, startTime, roundingMinutes, lunchStart = '12:00', lunchEnd = '13:00') {
  const blocks = [];
  let currentTime = startTime;
  
  for (const ticket of sortedTickets) {
    let remainingMinutes = ticket.roundedDurationMinutes;
    let isFirstBlock = true;
    
    while (remainingMinutes > 0) {
      // Check if we run into lunch break
      const minutesUntilLunch = getMinutesBetween(currentTime, lunchStart);
      
      if (currentTime < lunchStart && minutesUntilLunch < remainingMinutes) {
        // Block before lunch break
        blocks.push({
          issue_key: ticket.issue_key,
          from: currentTime,
          to: lunchStart,
          duration_minutes: minutesUntilLunch,
          raw_duration: isFirstBlock ? ticket.duration_seconds : null,
          tokens: isFirstBlock ? ticket.tokens : null,
          description: ticket.generatedDescription,
          is_continuation: !isFirstBlock
        });
        
        remainingMinutes -= minutesUntilLunch;
        currentTime = lunchEnd; // Skip over lunch break
        isFirstBlock = false;
      } else {
        // Normal block (or after lunch break)
        const endTime = addMinutes(currentTime, remainingMinutes);
        
        blocks.push({
          issue_key: ticket.issue_key,
          from: currentTime,
          to: endTime,
          duration_minutes: remainingMinutes,
          raw_duration: isFirstBlock ? ticket.duration_seconds : null,
          tokens: isFirstBlock ? ticket.tokens : null,
          description: ticket.generatedDescription,
          is_continuation: !isFirstBlock
        });
        
        currentTime = endTime;
        remainingMinutes = 0;
      }
    }
  }
  
  return blocks;
}
```

### Step 6: Proportional Split for Raw/Tokens

When a booking is split (e.g., due to lunch break), the raw hours and tokens are distributed **proportionally** across all blocks of that ticket.

**Formula:**
```javascript
// For a ticket with total_duration = 3.25h, raw = 2.21h, tokens = 174000
// Split into Block 1 (2.75h) and Block 2 (0.50h):

block1_raw = total_raw * (block1_duration / total_duration)
           = 2.21 * (2.75 / 3.25) = 1.87h

block1_tokens = total_tokens * (block1_duration / total_duration)
              = 174000 * (2.75 / 3.25) = 147273

block2_raw = total_raw * (block2_duration / total_duration)
           = 2.21 * (0.50 / 3.25) = 0.34h

block2_tokens = total_tokens * (block2_duration / total_duration)
              = 174000 * (0.50 / 3.25) = 26727
```

### Step 7: Generate Description

For each ticket, all individual descriptions are combined into a value-oriented summary.

**All blocks of a ticket get the same description** (no "(Continued)" prefix needed in CSV).

## Value-Oriented Description

### Goal

The description should communicate the **value/outcome** of the work, not list individual activities.

### Principles

| Principle | Explanation |
|-----------|-------------|
| **Outcome over Activity** | "Feature implemented" instead of "Code written, tests written" |
| **Concise** | 1 sentence, max. 80 characters |
| **Booking-suitable** | Understandable for time tracking and reporting |

### Do's and Don'ts

**DO:**
- Focus on the result/deliverable
- Use technical terms when appropriate
- Name concrete benefit

**DON'T:**
- List individual tool calls
- Generic phrases like "Various" or "Working on X"
- Too technical details (no commit hashes etc.)

### Example Transformations

| Raw Descriptions | Value-Oriented Summary |
|------------------|------------------------|
| PR Setup, PR Merge, Version Bump, CHANGELOG, Tag | Release v0.20.0 published |
| Timesheet implementation, Visualization with charts | Timesheet feature with chart visualization implemented |
| Remove user_email, .env setup, Schema update | User config migrated to environment variable |
| Light chat, Greeting, Quick greeting | Coordination and alignment |
| Reviewing commit, Configuring paths, Assets setup | Marp asset structure and configuration |

### Generation Guidelines

When creating the booking suggestion:

1. **Collect** all descriptions of the ticket for the day
2. **Identify** the overarching goal/outcome
3. **Formulate** a concise sentence (max. 80 characters)
4. **Check** for booking suitability

## Output Format

### CSV Schema: booking-proposal-{date}.csv

The `/time-tracking.booking-proposal` command generates one CSV file per day:

```csv
date_from,date_to,issue_key,account_key,from,to,duration_hours,raw_hours,tokens,description
```

| Field | Type | Description |
|-------|------|-------------|
| `date_from` | Date | Start date (YYYY-MM-DD) |
| `date_to` | Date | End date (usually = date_from) |
| `issue_key` | String | JIRA ticket (empty for "Other") |
| `account_key` | String | Tempo Account Key |
| `from` | Time | Calculated start time (HH:MM) |
| `to` | Time | Calculated end time (HH:MM) |
| `duration_hours` | Decimal | Rounded booking duration in hours |
| `raw_hours` | Decimal | Proportional raw time in hours |
| `tokens` | Integer | Proportional token count |
| `description` | String | Value-oriented description (max 80 chars) |

**Example with lunch break split:**

```csv
date_from,date_to,issue_key,account_key,from,to,duration_hours,raw_hours,tokens,description
2026-01-28,2026-01-28,SOSO-286,TD_KS_1100,09:15,12:00,2.75,1.87,147273,Schema und Admin API implementiert
2026-01-28,2026-01-28,SOSO-286,TD_KS_1100,13:00,13:30,0.50,0.34,26727,Schema und Admin API implementiert
2026-01-28,2026-01-28,,TD_KS_1100,13:30,14:00,0.50,0.42,31000,Team-Meetings und Koordination
```

**Notes:**
- All fields are quoted in the CSV
- Empty `issue_key` = "Other" work (no ticket assigned)
- Split blocks have the same description, raw/tokens are proportionally distributed
- Files are saved to `bookings_dir` (default: `.opencode/time_tracking/bookings/`)

### Table "Booking Suggestion"

```markdown
### Booking Suggestion

Cumulated time blocks for manual booking (rounded to 15 minutes):

| Ticket | From | To | Duration | Raw | Tokens | Description |
|--------|------|-----|----------|-----|--------|-------------|
| SETUP-011 | 11:15 | 11:30 | 0.25h | 0.02h | 3K | Playwright MCP evaluated |
| PROJ-110 | 11:30 | 12:00 | 0.50h | 0.28h | 33K | Timesheet, Command-Prefix, Env-Migration |
| - | 13:00 | 13:30 | 0.50h | 0.42h | 31K | Marp asset setup and configuration |

**Total:** 1.25h Booking (0.72h Raw, 67K Tokens)
```

### Column Explanation

| Column | Content |
|--------|---------|
| Ticket | `issue_key` or `-` for Other |
| From | Calculated start time (HH:mm) |
| To | Calculated end time (HH:mm) |
| Duration | Rounded booking duration |
| Raw | Actually worked time |
| Tokens | Token usage for this ticket |
| Description | Value-oriented summary |

### Example with Lunch Break (Split)

When a booking spans the lunch break:

```markdown
| Ticket | From | To | Duration | Raw | Tokens | Description |
|--------|------|-----|----------|-----|--------|-------------|
| PROJ-110 | 11:00 | 12:00 | 1.00h | 0.80h | 50K | Feature X implemented |
| PROJ-110 | 13:00 | 13:30 | 0.50h | | | (Continued) Feature X implemented |
```

**Rules for continuation:**
- **Raw:** empty
- **Tokens:** empty
- **Description:** `(Continued) [Original-Description]`

### Gantt Chart "Booking Suggestion"

```mermaid
gantt
    title Booking Suggestion 2026-01-08
    dateFormat HH:mm
    section Morning
    SETUP-011: Playwright       :11:15, 15m
    PROJ-110: Timesheet etc.    :11:30, 30m
    section Afternoon
    Other: Marp Setup       :13:00, 30m
```

**Generation:**
- Group by Morning/Afternoon (before/after lunch break)
- Description: First 20 characters of generated summary
- Duration: Rounded duration in minutes

## Configuration

All booking settings are read from `.opencode/opencode-project.json`:

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
    },
    "sync": {
      "calendar": {
        "calendar_id": "...",
        "color_id": "9"
      },
      "sheets": {
        "folder_id": "..."
      }
    }
  }
}
```

| Setting | Default | Description |
|---------|---------|-------------|
| `bookings_dir` | `.opencode/time_tracking/bookings/` | Output directory for CSV files |
| `booking.rounding_minutes` | `5` | Rounding unit (5, 10, 15, or 30) |
| `booking.lunch_break.start` | `"12:00"` | Lunch break start (HH:MM) |
| `booking.lunch_break.end` | `"13:00"` | Lunch break end (HH:MM) |
| `sync.calendar.calendar_id` | - | Google Calendar ID for sync |
| `sync.calendar.color_id` | - | Event color (optional) |
| `sync.sheets.folder_id` | - | Google Drive folder for sheets |

## Calendar Integration (Optional)

When `source_calendar_id` is configured, booking proposals can include meetings from Google Calendar.

### Configuration

#### Environment Variables (Recommended)

Personal calendar IDs should be set via environment variables:

```bash
# Add to ~/.bashrc, ~/.zshrc, or .env
export TT_SOURCE_CALENDAR_ID="your-email@company.com"
export TT_BOOKING_CALENDAR_ID="c_abc123@group.calendar.google.com"
```

| Variable | Required | Description |
|----------|----------|-------------|
| `TT_SOURCE_CALENDAR_ID` | No | Primary calendar with meetings (read-only) |
| `TT_BOOKING_CALENDAR_ID` | For sync | Target calendar for booking events (write) |

#### Configuration File (Fallback)

If environment variables are not set, values from `.opencode/opencode-project.json` are used:

```json
{
  "time_tracking": {
    "sync": {
      "calendar": {
        "source_calendar_id": "user@company.com",
        "booking_calendar_id": "c_abc123@group.calendar.google.com",
        "ticket_pattern": "([A-Z]+-\\d+)",
        "account_pattern": "(TD_[A-Z0-9_]+)",
        "jira_base_url": "https://company.atlassian.net/browse"
      }
    }
  }
}
```

### Calendar Event Filtering

When loading calendar events:

1. Fetch events for the target date from `source_calendar_id`
2. Read filter configuration from `time_tracking.sync.calendar.filter`
3. Apply configurable filters (see below)
4. For each included event:
   - Extract `issue_key` using `ticket_pattern` regex from title/description
   - Extract `account_key` using `account_pattern` regex from title/description
   - Use `global_default.account_key` as fallback when no account found
   - Set `source = "calendar"` and `source_event_id = event.id`

### Filter Configuration

Configure event filtering in `opencode-project.json`:

```json
{
  "time_tracking": {
    "sync": {
      "calendar": {
        "source_calendar_id": "{env.TT_SOURCE_CALENDAR_ID}",
        "filter": {
          "exclude_title_patterns": ["^\\[PRIVAT\\]", "^\\[PERSONAL\\]"],
          "require_attendees": false,
          "require_accepted": true,
          "exclude_all_day": true
        }
      }
    }
  }
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `exclude_title_patterns` | `string[]` | `[]` | Regex patterns (case-insensitive) to exclude events by title |
| `require_attendees` | `boolean` | `false` | Only include events that have attendees |
| `require_accepted` | `boolean` | `true` | Only include events user has accepted |
| `exclude_all_day` | `boolean` | `true` | Exclude all-day events (no specific time) |

### Filter Logic (Applied in Order)

```
For each calendar event:

1. IF exclude_all_day == true AND event has only date (no dateTime):
   → SKIP "All-day event"

2. IF require_accepted == true AND responseStatus != "accepted":
   → SKIP "Not accepted"

3. IF require_attendees == true AND attendees is empty/null:
   → SKIP "No attendees"

4. FOR pattern IN exclude_title_patterns:
   IF RegExp(pattern, 'i').test(event.summary):
     → SKIP "Title excluded: matches /{pattern}/i"

5. → INCLUDE event
```

### Common Patterns

| Pattern | Matches | Use Case |
|---------|---------|----------|
| `^\\[PRIVAT\\]` | `[PRIVAT] Arzttermin` | Personal appointments |
| `^\\[PERSONAL\\]` | `[PERSONAL] Gym` | Personal time blocks |
| `Fokuszeit` | `Fokuszeit`, `Meine Fokuszeit` | Focus time blocks |
| `^OOO:` | `OOO: Vacation` | Out of office |

**Note:** Patterns are JavaScript regex with case-insensitive flag (`/pattern/i`).

### Merge Logic

```
Calendar events = FIXED (exact times preserved)
CSV worklogs = FILLS GAPS (scheduled sequentially around calendar events)

Timeline:
  08:00                    12:00         13:00                    17:00
    |                        |             |                        |
    v                        v             v                        v
  [Calendar: Standup 09:00-09:30]      [Calendar: Review 14:00-15:00]
         |                                    |
         v                                    v
  [CSV: 08:15-09:00] [CSV: 09:30-12:00]  [CSV: 13:00-14:00] [CSV: 15:00-...]
```

**Rules:**
- Calendar events retain their exact start/end times
- CSV worklogs are scheduled in remaining gaps
- Overlap: CSV entries are pushed AFTER calendar events on overlap
- Lunch break only applies to CSV worklogs, not calendar events

### Merge Algorithm (Detailed)

```javascript
function mergeCalendarAndCSV(calendarEvents, csvEntries, config) {
  // 1. Sort calendar events by start time
  const sortedCalendar = calendarEvents.sort((a, b) => a.start - b.start);
  
  // 2. Sort CSV entries by first_activity
  const sortedCSV = csvEntries.sort((a, b) => a.first_activity - b.first_activity);
  
  // 3. Find earliest activity (across both sources)
  const earliestTime = Math.min(
    sortedCalendar[0]?.start || Infinity,
    sortedCSV[0]?.first_activity || Infinity
  );
  
  // 4. Round down to rounding interval
  let currentTime = roundDown(earliestTime, config.rounding_minutes);
  
  // 5. Build timeline
  const timeline = [];
  let csvIndex = 0;
  
  for (const calEvent of sortedCalendar) {
    // Fill gap before calendar event with CSV entries
    while (csvIndex < sortedCSV.length && currentTime < calEvent.start) {
      const csv = sortedCSV[csvIndex];
      const availableSlot = calEvent.start - currentTime;
      
      // Check lunch break
      if (crossesLunchBreak(currentTime, csv.duration, config.lunch_break)) {
        // Split CSV entry around lunch
        const beforeLunch = splitBeforeLunch(csv, currentTime, config);
        const afterLunch = splitAfterLunch(csv, config);
        timeline.push(beforeLunch, afterLunch);
        currentTime = afterLunch.end;
      } else if (csv.duration <= availableSlot) {
        // CSV fits in slot
        timeline.push({ ...csv, from: currentTime, to: currentTime + csv.duration });
        currentTime += csv.duration;
      } else {
        // CSV doesn't fit, push after calendar event
        break;
      }
      csvIndex++;
    }
    
    // Add calendar event (fixed time)
    timeline.push({
      ...calEvent,
      source: 'calendar',
      from: calEvent.start,
      to: calEvent.end
    });
    currentTime = Math.max(currentTime, calEvent.end);
  }
  
  // 6. Add remaining CSV entries after all calendar events
  while (csvIndex < sortedCSV.length) {
    const csv = sortedCSV[csvIndex];
    // Handle lunch break for remaining entries
    if (crossesLunchBreak(currentTime, csv.duration, config.lunch_break)) {
      const beforeLunch = splitBeforeLunch(csv, currentTime, config);
      const afterLunch = splitAfterLunch(csv, config);
      timeline.push(beforeLunch, afterLunch);
      currentTime = afterLunch.end;
    } else {
      timeline.push({ ...csv, from: currentTime, to: currentTime + csv.duration });
      currentTime += csv.duration;
    }
    csvIndex++;
  }
  
  return timeline;
}
```

**Key Points:**
1. Calendar events are placed first at their exact times
2. CSV entries fill gaps BEFORE each calendar event
3. If CSV doesn't fit in gap, it's pushed after the calendar event
4. Lunch break splitting only applies to CSV entries
5. Final output is sorted by `from` time

### Extended CSV Schema

With calendar and tempo integration, the CSV includes additional columns:

```csv
date_from,date_to,issue_key,account_key,from,to,duration_hours,raw_hours,tokens,description,source,source_event_id,booking_event_id,tempo_worklog_id,tempo_sync_status,tempo_response_message
```

| Column | Description |
|--------|-------------|
| `source` | `csv` (from time tracking) or `calendar` (from source calendar) |
| `source_event_id` | Event ID from source calendar (only for source=calendar) |
| `booking_event_id` | Created event ID in booking calendar (filled by /sync-calendar) |
| `tempo_worklog_id` | Tempo worklog ID (filled by /sync-tempo) |
| `tempo_sync_status` | Tempo sync status: `waiting`, `in_progress`, `success`, `error`, `deleted` |
| `tempo_response_message` | Tempo API response message |

### Tempo Sync Status Values

| Status | Meaning | Sync Action |
|--------|---------|-------------|
| `waiting` | New entry, not yet synced | CREATE |
| `in_progress` | Currently being synced | SKIP |
| `success` | Successfully synced | UPDATE |
| `error` | Sync failed | Retry (CREATE or UPDATE) |
| `deleted` | Marked for deletion | DELETE, then remove row |

### Sync-ID Preservation

When regenerating a booking proposal for a date that already has a CSV:

1. Load existing CSV and extract sync IDs:
   - `booking_event_id` (from /sync-calendar)
   - `tempo_worklog_id`, `tempo_sync_status`, `tempo_response_message` (from /sync-tempo)
2. Match entries by `(from, to, issue_key)` triple
3. Preserve all sync IDs for matched entries
4. New entries get `tempo_sync_status = "waiting"` and empty IDs

This enables sync commands to UPDATE existing entries instead of creating duplicates.

### References

For sync details, see:
- **`time-tracking-calendar-sync`** skill - Calendar sync
- `/time-tracking.sync-tempo` command - Tempo sync

## Summary

| Aspect | Value |
|--------|-------|
| Cumulation | Per ticket per day (one booking) |
| Sorting | By first activity of the day |
| Start time | Earliest activity, rounded down |
| Time blocks | Sequential, without gaps |
| Lunch break | Configurable (default: 12:00-13:00) |
| Default rounding | 5 minutes (configurable) |
| Rounding logic | Round up (ceil) |
| For split | Same description, raw/tokens proportionally distributed |
| Description | AI-generated, value-oriented, max. 80 characters |
| Output | One CSV file per day |
| Calendar integration | Optional, merges meetings with worklogs |
