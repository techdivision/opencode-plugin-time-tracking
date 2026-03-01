---
description: Generate booking proposal CSV from time tracking entries with optional calendar integration
agent: worklog
---

# Booking Proposal

**Arguments:** `$ARGUMENTS` (Format: `[period]`)

## Period Options

| Input | Meaning |
|-------|---------|
| (empty) | Today |
| `today` | Today |
| `yesterday` | Yesterday |
| `YYYY-MM-DD` | Specific date |
| `YYYY-MM-DD YYYY-MM-DD` | Date range (max 31 days) |

## Examples

```bash
/time-tracking.booking-proposal              # Today
/time-tracking.booking-proposal yesterday    # Yesterday
/time-tracking.booking-proposal 2026-01-28   # Specific date
/time-tracking.booking-proposal 2026-01-20 2026-01-29  # Range
```

## Skills Reference

Load these skills for detailed specifications:
- **`time-tracking-csv`** - CSV format, field definitions, configuration
- **`time-tracking-booking`** - Booking algorithm, cumulation logic, output schema
- **`time-tracking-calendar-sync`** - Calendar integration, merge logic

## Output

Creates one CSV file per day in `bookings_dir` (default: `.opencode/time_tracking/bookings/`):
- Filename: `booking-proposal-{YYYY-MM-DD}.csv`
- Cumulates entries per ticket
- Applies rounding (default: 5 min)
- Handles lunch break splits
- Generates value-oriented descriptions
- Integrates calendar events (if `TT_SOURCE_CALENDAR_ID` configured)

## Calendar Integration

If `TT_SOURCE_CALENDAR_ID` is set, calendar events are merged into the booking proposal:
- Calendar events keep their exact times (`source="calendar"`)
- CSV entries fill gaps around calendar events (`source="csv"`)

## Sync Options

After generating the CSV, you can sync to various targets:
- `/time-tracking.sync-calendar` - Sync to Google Calendar
- `/time-tracking.sync-drive` - Sync to Google Sheets (not yet implemented)
- `/time-tracking.sync-tempo` - Sync to JIRA Tempo (not yet implemented)
