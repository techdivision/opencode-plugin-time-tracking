# @techdivision/opencode-plugin-time-tracking

Automatic time tracking plugin for OpenCode. Tracks session duration and tool usage, writing entries to a CSV file compatible with Jira worklog sync incl. commands, skills and agents.

## Overview

| Content Type | Name | Description |
|--------------|------|-------------|
| Plugin | `src/Plugin.ts` | Plugin entry point with event and tool hooks |
| Skills | `time-tracking-csv`, `time-tracking-reports`, `time-tracking-booking`, `time-tracking-calendar-sync`, `time-tracking-tempo-sync` | On-demand knowledge for time tracking workflows |
| Agents | `time-tracking`, `booking-proposal`, `calendar-sync`, `drive-sync`, `tempo-sync`, `worklog` | Specialized agents for tracking and sync tasks |
| Commands | `track-time`, `timesheet`, `booking-proposal`, `sync-calendar`, `sync-drive`, `sync-tempo`, `sync-worklogs`, `init` | Slash commands for time tracking operations |
| Tools | `track-time`, `cumulate-daily-worklogs`, `sync-tempo-worklog` | Custom tools for CSV writing and worklog sync |

## Prerequisites

### opencode-plugin-shell-env (required)

This plugin relies on [`@techdivision/opencode-plugin-shell-env`](https://github.com/techdivision/opencode-plugin-shell-env) to load environment variables from `.opencode/.env` into `process.env`. This is required for variables like `OPENCODE_USER_EMAIL` and any other secrets used by the time tracking tools.

**Important:** The `shell-env` plugin must be listed **before** `time-tracking` in your `.opencode/opencode.json`, because plugins are loaded in order and `shell-env` needs to populate `process.env` before this plugin reads from it:

```json
{
  "plugin": [
    "@techdivision/opencode-plugin-shell-env",
    "@techdivision/opencode-plugin-time-tracking"
  ]
}
```

Without `shell-env`, environment variables from `.opencode/.env` will not be available. The plugin will still work, but will fall back to system environment variables or defaults (e.g., system username instead of `OPENCODE_USER_EMAIL`).

## Installation

Add to your `.opencode/package.json`:

```json
{
  "dependencies": {
    "@techdivision/opencode-plugin-shell-env": "^1.1.1",
    "@techdivision/opencode-plugin-time-tracking": "^0.1.0"
  }
}
```

Install and link:

```bash
cd .opencode && npm install
npx opencode-link shell-env
npx opencode-link time-tracking
```

## Development

```bash
npm install
npx tsc --noEmit
```
