---
description: Sync booking proposals to Google Sheets (not yet implemented)
agent: drive-sync
---

# Sync Drive

**Not yet implemented**

This command will sync booking proposals to Google Sheets.

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
/time-tracking.sync-drive              # Today
/time-tracking.sync-drive yesterday    # Yesterday
/time-tracking.sync-drive 2026-01-28   # Specific date
```

## Prerequisites

1. **Booking proposal must exist:** `.opencode/time_tracking/bookings/booking-proposal-{date}.csv`
   - If missing: Run `/time-tracking.booking-proposal` first

2. **Drive folder must be configured:**
   - Environment variable: `TT_DRIVE_FOLDER_ID`
   - Or config: `time_tracking.sync.drive.folder_id`

## Planned Features

- Create monthly Google Sheets
- One row per booking entry
- Auto-sum formulas for daily/weekly totals
