# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.4.0] - 2026-03-15

### Added

- **LLM-based worklog descriptions** via direct `fetch()` to configured Chat Completions API (COPSPA-65)
- New `title_generation` config section with fields: `model`, `api_url`, `api_key`, `prompt`, `timeout_ms`, `max_chars`, `locale`, `enabled`
- `locale` config field (default: `de-DE`) to control output language of generated descriptions
- `TitleGenerator` service with synchronous config-based provider resolution (no SDK calls to OpenCode)
- `ProviderAdapter` for Chat Completions API request building and response parsing
- `MessageExtractor` utility to extract last 3 conversation turns (user + assistant) as LLM context
- Health-check at startup (fire-and-forget) with toast notification when API is not reachable
- Toast hint "(title generation NOT available)" on each tracking event when not configured
- Support for `{env:VAR_NAME}` syntax in `api_key` config field
- Support for custom prompt files via `prompt` config field with `{{LOCALE}}` and `{{MAX_CHARS}}` placeholders
- Support for plain model format (e.g., `"llama3:8b"`) in addition to `"provider/model"` format

### Changed

- Worklog descriptions now use format `"LLM Description | Activity Summary"` when title generation is active
- Default `max_chars` for generated descriptions is 240
- Plugin startup: provider resolution is synchronous in constructor (immediately available)
- Plugin startup: health-check runs as fire-and-forget (never blocks plugin initialization)
- LLM context uses last 3 conversation turns instead of first user prompt (fixes wrong context in long sessions)

### Fixed

- **Plugin startup hang**: Removed SDK calls (`client.config.get()`, `client.config.providers()`) from plugin initialization that caused OpenCode to freeze during startup
- LLM response cleaning: strips common hallucinated prefixes (`"Ticket: N/A Description:"`, `"Title:"`, etc.) and wrapping quotes
- Agent names in CSV now consistently written without `@` prefix

## [1.3.3] - 2026-03-15

### Fixed

- Migrated from deprecated `session.idle` event to `session.status` event (COPSPA-66)
- Only `status.type === "idle"` triggers time entry export; `busy` and `retry` events are ignored

## [1.3.2] - 2026-03-06

### Fixed

- Correct sync options descriptions in `booking-proposal` command:
  - `sync-drive`: "Upload CSV to Google Drive" (was incorrectly described)
  - `sync-tempo`: "Sync to JIRA Tempo worklogs" (was marked as "not yet implemented")

## [1.3.1] - 2026-03-06

### Changed

- `cumulate-daily-worklogs` tool now filters entries by `notes === "Manual entry"` only
- Booking proposals now correctly use only manually tracked entries, ignoring auto-tracked session entries

### Removed

- Obsolete `sync-worklogs` command (functionality replaced by `booking-proposal`)

### Fixed

- Replace real email addresses with `j.doe@example.com` in documentation examples

## [1.3.0] - 2026-03-05

### Added

- **Webhook support** for time tracking entries via `WebhookSender` service
- `WriterService` interface for pluggable output writers (extensible architecture)
- `WriteResult` interface: `{ writer: string, success: boolean, error?: string }`
- New environment variables for webhook configuration:
  - `TT_WEBHOOK_URL` - Webhook endpoint URL (optional, webhook disabled if not set)
  - `TT_WEBHOOK_BEARER_TOKEN` - Bearer token for webhook authentication (optional)
- Tool response now includes `writers: WriteResult[]` array for detailed status

### Changed

- **BREAKING:** `WriterService.write()` now returns `Promise<WriteResult>` instead of `Promise<void>`
- `EventHook` now accepts an array of `WriterService` implementations
- `EventHook` collects `WriteResult[]` and shows combined status toast
- UUID is generated once in `EventHook` and passed to all writers (consistent ID across CSV and webhook)
- `CsvWriter` refactored to implement `WriterService` interface, returns `WriteResult`
- `WebhookSender` returns `WriteResult` (toast handler removed, consolidated in `EventHook`)
- `CsvEntryData` extended with `id` and `userEmail` fields
- `track-time` tool refactored to use `WriterService` architecture directly

### Technical

- Both CSV and webhook are triggered on each `session.idle` event
- CSV is written first (as backup), then webhook is called
- Consistent error handling across all writers
- Single combined toast shows all writer statuses (e.g., "csv: ✓, webhook: ✗")
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
