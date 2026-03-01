---
description: Syncs booking proposals to Google Sheets (not yet implemented)
mode: subagent
tools:
  read: true
---

# Drive Sync Agent

## Status

**Not yet implemented**

This agent will sync booking proposals to Google Sheets.

## Planned Features

- Create/update Google Sheet per month
- One row per booking entry
- Auto-sum formulas for daily/weekly totals
- Support for multiple projects/accounts

## Configuration

### Environment Variables (Recommended)

```bash
export TT_DRIVE_FOLDER_ID="your-google-drive-folder-id"
```

### Configuration File (Fallback)

`.opencode/opencode-project.json`:

```json
{
  "time_tracking": {
    "sync": {
      "drive": {
        "folder_id": "your-google-drive-folder-id"
      }
    }
  }
}
```

## Workflow (Planned)

1. Read booking-proposal CSV for the specified date
2. Find or create Google Sheet for the month
3. Update/append rows for the date
4. Update formulas and totals

## MCP Tools Required

- `google-workspace-mcp_create_spreadsheet`
- `google-workspace-mcp_update_spreadsheet`
- `google-workspace-mcp_get_spreadsheet`
