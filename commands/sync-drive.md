---
description: Sync booking proposals or raw time tracking CSV to Google Drive
agent: drive-sync
---

# Sync Drive

**Arguments:** `$ARGUMENTS` (Format: `[--raw] [period]`)

## Modi

| Modus | Beschreibung |
|-------|-------------|
| Default | Booking-Proposal CSV hochladen (`booking-proposal-{date}.csv`) |
| `--raw` | Rohe `time_tracking.csv` hochladen |

## Period Options

| Input | Meaning |
|-------|---------|
| (empty) | Today |
| `today` | Today |
| `yesterday` | Yesterday |
| `YYYY-MM-DD` | Specific date |

> **Hinweis:** Period wird nur im Default-Modus verwendet (bestimmt welche Booking-Proposal Datei).
> Im `--raw` Modus wird immer die gesamte `time_tracking.csv` hochgeladen.

## Examples

```bash
/time-tracking.sync-drive                    # Booking-Proposal fuer heute
/time-tracking.sync-drive yesterday          # Booking-Proposal fuer gestern
/time-tracking.sync-drive 2026-01-28         # Booking-Proposal fuer bestimmtes Datum
/time-tracking.sync-drive --raw              # Rohe time_tracking.csv hochladen
/time-tracking.sync-drive --raw today        # Identisch mit --raw (Period wird ignoriert)
```

## Dateinamen-Format

Hochgeladene Dateien werden nach folgendem Schema benannt:

| Modus | Dateiname |
|-------|-----------|
| Default | `{OPENCODE_USER_EMAIL}-booking_proposal-{date}-{YYYYMMDDHHmmss}.csv` |
| `--raw` | `{OPENCODE_USER_EMAIL}-time_tracking-{YYYYMMDDHHmmss}.csv` |

**Beispiele:**
- `j.doe@example.com-booking_proposal-2026-03-01-20260301193100.csv`
- `j.doe@example.com-time_tracking-20260301193100.csv`

## Skills Reference

Load these skills for detailed specifications:
- **`time-tracking-booking`** - CSV format and booking proposal structure

## Prerequisites

1. **Booking proposal must exist** (nur Default-Modus):
   `.opencode/time_tracking/bookings/booking-proposal-{date}.csv`
   - If missing: Run `/time-tracking.booking-proposal` first

2. **Drive Folder ID must be set** (in `.opencode/.env` or environment):
   ```bash
   TT_DRIVE_FOLDER_ID=your-google-drive-folder-id
   ```

3. **User Email must be set** (in `.opencode/.env` or environment):
   ```bash
   OPENCODE_USER_EMAIL=your.email@company.com
   ```

## Output

- Uploads CSV file to configured Google Drive folder
- Shows upload confirmation with file name and Drive link
