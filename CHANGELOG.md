# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-03-01

### Added

- Plugin source migrated from `@techdivision/opencode-time-tracking` to standalone package
- Event hook for session tracking (start, end, duration, token usage)
- Tool execute after hook for ticket extraction from tool calls
- ConfigLoader with `process.env` fallback chain (delegated .env loading to `opencode-plugin-shell-env`)
- CsvWriter for Jira/Tempo-compatible worklog CSV export
- SessionManager, TicketExtractor, TicketResolver services
- 5 skills: csv, reports, booking, calendar-sync, tempo-sync
- 6 agents: time-tracking, booking-proposal, calendar-sync, drive-sync, tempo-sync, worklog
- 8 commands: track-time, timesheet, booking-proposal, sync-calendar, sync-drive, sync-tempo, sync-worklogs, init
- 3 tools: track-time, cumulate-daily-worklogs, sync-tempo-worklog
- GitHub Actions publish workflow (tag-based npm publish with provenance)
