---
description: Sync booking proposals to JIRA Tempo worklogs
agent: tempo-sync
---

# Sync Tempo

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
/time-tracking.sync-tempo              # Today
/time-tracking.sync-tempo yesterday    # Yesterday
/time-tracking.sync-tempo 2026-01-28   # Specific date
```

## Skills Reference

Load these skills for detailed specifications:
- **`time-tracking-tempo-sync`** - Sync workflow, Tempo API, status handling
- **`time-tracking-booking`** - CSV format and booking proposal structure

## Prerequisites

1. **Booking proposal must exist:** `.opencode/time_tracking/bookings/booking-proposal-{date}.csv`
   - If missing: Run `/time-tracking.booking-proposal` first

2. **Tempo API Token must be set** (in `.env` or environment):
   ```bash
   TT_TEMPO_API_TOKEN="your-tempo-api-token"
   ```

3. **Atlassian Account ID must be set** (in `.env` or environment):
   ```bash
   TT_ATLASSIAN_ACCOUNT_ID="your-account-id"
   ```
   Find via: `curl -u email:token https://your-domain.atlassian.net/rest/api/3/myself | jq -r '.accountId'`

4. **Base URL** is configured in `opencode-project.json` (default: `https://api.tempo.io`)

4. **All entries must have issue_key** - Entries without issue_key abort the sync

## Output

- Creates/updates/deletes worklogs in Tempo
- Updates CSV with `tempo_worklog_id` and `tempo_sync_status`
- Shows summary table of actions taken
