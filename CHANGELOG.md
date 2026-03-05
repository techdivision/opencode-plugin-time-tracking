# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.3.0] - 2026-03-05

### Added

- **Webhook support** for time tracking entries via `WebhookSender` service
- `WriterService` interface for pluggable output writers (extensible architecture)
- New environment variables for webhook configuration:
  - `TT_WEBHOOK_URL` - Webhook endpoint URL (optional, webhook disabled if not set)
  - `TT_WEBHOOK_BEARER_TOKEN` - Bearer token for webhook authentication (optional)

### Changed

- `EventHook` now accepts an array of `WriterService` implementations
- UUID is generated once in `EventHook` and passed to all writers (consistent ID across CSV and webhook)
- `CsvWriter` refactored to implement `WriterService` interface
- `CsvEntryData` extended with `id` and `userEmail` fields

### Technical

- Both CSV and webhook are triggered on each `session.idle` event
- CSV is written first (as backup), then webhook is called
- Webhook failures show toast notification but don't block CSV writing
- Webhook payload matches CSV entry structure (JSON format)

## [1.2.0] - 2026-03-01

### Added

- Postlink hook (`scripts/postlink.js`) that automatically creates `~/time_tracking/` with subdirectories (`bookings/`, `charts/`, `reports/`) and symlinks `.opencode/time_tracking` → `~/time_tracking` when the plugin is linked
- `scripts/` directory included in npm package for hook distribution

### Changed

- Removed `*.js` from `.gitignore` (no build step, Bun loads `.ts` directly)
- `plugin.json` now declares `hooks.postlink` for the linker

## [1.1.0] - 2026-03-01

### Added

- Drive sync agent and command documentation with full upload workflow and `--raw` mode
- Sync Features section in README with commands overview, environment variables, and configuration
- Complete `.env` example with all sync-related variables

### Fixed

- Invalid JIRA issue keys in examples across README, skills, and type definitions (`PROJ-DEV-001` → `PROJ-101` etc.)

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
