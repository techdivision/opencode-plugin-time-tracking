---
description: Record time entry for completed task
agent: time-tracking
---

Record a time tracking entry with the provided arguments.

**Arguments:** `$ARGUMENTS`

**Format:** `[issue_key] [description] [duration] [start_time] [account_key]`

| Argument | Format | Default |
|----------|--------|---------|
| issue_key | `SOSO-286` | from session/config |
| description | text | `n/a` |
| duration | `30m`, `1.5h`, `1h30m` | time since last entry (or `15m`) |
| start_time | `HH:MM` | end_time of last entry today |
| account_key | `TD_XXX` | from config |

**Smart Duration:** When no duration is provided, the entry seamlessly continues from the last entry's end_time until now.

**Examples:**
```
/time-tracking.track-time
/time-tracking.track-time SOSO-286
/time-tracking.track-time SOSO-286 "Feature done"
/time-tracking.track-time SOSO-286 "Feature done" 1h
/time-tracking.track-time SOSO-286 "Feature done" 1h 09:30
```

## Session Ticket Declaration

To set a ticket for all time entries in the current session, declare it anywhere in your conversation using a recognized phrase:

```
User: "I'm working on PROJ-123"
User: "Let's implement the new feature..."
...
/time-tracking.track-time  ← Will use PROJ-123 from session declaration
```

**Default phrases** (configurable via `time_tracking.session_ticket_phrases`):
- "I'm working on {ticket}"
- "I am working on {ticket}"
- "Let's work on {ticket}"
- "Starting work on {ticket}"
- "Working on {ticket}"
- "Ticket: {ticket}"
- "Issue: {ticket}"

If you declare a new ticket later in the conversation, the most recent declaration is used.

## Issue Key Resolution

When `issue_key` is not provided as argument, resolve in order:

1. **Session ticket**: Scan conversation for explicit ticket declarations using configured phrases
   - Check `time_tracking.session_ticket_phrases` in config (array of phrase patterns)
   - `{ticket}` placeholder is replaced with pattern `[A-Z][A-Z0-9]+-\d+`
   - Use the **most recent** declared ticket if multiple found
   - This is an **intentional declaration**, not arbitrary pattern matching
2. `agent_defaults[@agent].issue_key` (if agent context exists)
3. `global_default.issue_key` (fallback)

If still empty → Error: "No issue_key found in configuration. Please provide one or configure in opencode-project.json"

## Confirmation Output

```
Time Entry Recorded

  Issue Key:   PROJ-123 (from: session ticket | agent config | global default | argument)
  Date:        2026-01-09
  Time:        09:30:00 - 09:45:00
  Duration:    15m (900 seconds)
  Account:     TD_DEVELOPMENT
  Description: n/a

  Saved to: ~/time_tracking/time-tracking.csv
```
