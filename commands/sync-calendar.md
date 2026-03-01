---
description: Sync booking proposals to Google Calendar
agent: calendar-sync
---

# Sync Calendar

**Arguments:** `$ARGUMENTS` (Format: `[period]`)

## Period Options

| Input | Meaning |
|-------|---------|
| (empty) | Today |
| `today` | Today |
| `yesterday` | Yesterday |
| `YYYY-MM-DD` | Specific date |

## Examples

```bash
/time-tracking.sync-calendar              # Today
/time-tracking.sync-calendar yesterday    # Yesterday
/time-tracking.sync-calendar 2026-01-28   # Specific date
```

## Skills Reference

Load these skills for detailed specifications:
- **`time-tracking-calendar-sync`** - Sync workflow, event format, change detection
- **`time-tracking-booking`** - CSV format and booking proposal structure

## Prerequisites

1. **Booking proposal must exist:** `.opencode/time_tracking/bookings/booking-proposal-{date}.csv`
   - If missing: Run `/time-tracking.booking-proposal` first
2. **Calendar ID must be set:** Environment variable `TT_BOOKING_CALENDAR_ID` or config
   - If missing: Set `export TT_BOOKING_CALENDAR_ID="your-calendar-id@group.calendar.google.com"`

## Output

- Creates/updates/deletes events in booking calendar
- Updates CSV with `booking_event_id` values
- Shows summary table of actions taken
