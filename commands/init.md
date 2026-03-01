---
description: Initialize time tracking configuration for project or user setup
---

Initialize the time tracking configuration for this project. Automatically detects whether to run the full project setup or only user-specific setup based on existing configuration.

**Arguments:** `$ARGUMENTS`

| Argument | Description |
|----------|-------------|
| `--force` | Reset all settings to defaults and reconfigure (full project setup) |

## Task

Execute these steps in order.

## Input Types Guide

**Text Input with default/current value:**
- Use mcp_question with first option showing the current/default value
- Option 1 label: "Use: {value}" (add "(Recommended)" if it's a sensible default)
- Set custom: true (allows "Type your own answer" automatically)
- Example for email with existing value:
  ```
  1. Use: john@example.com (Recommended)
  2. Type your own answer
  ```

**Text Input without default (required field, no existing value):**
- Ask directly in chat: "Please enter your email address:"
- Wait for user response, validate, re-ask if invalid

**Yes/No Questions:**
- Use mcp_question with exactly 2 options: "Yes" and "No"
- Add "(Recommended)" suffix to the recommended option
- Set custom: false (no "Type your own answer" option needed)

**Selection from predefined values:**
- Use mcp_question with concrete options as labels
- Example: API endpoints with known values
- Set custom: true only if user might need an unlisted value

**Validation Errors:**
- On invalid input, show error message and re-ask the same question
- Do NOT proceed to next step until valid input is received

### 1. Check Schema Version and Apply Migrations

Read `.opencode/opencode-project.json` if it exists and apply any pending schema migrations.

```
if file does NOT exist:
  → Create initial config with $schema and version:
    {
      "$schema": "./node_modules/@techdivision/opencode-plugins/schemas/opencode-project.json",
      "version": "{target_version}"
    }
  → Skip to step 3

current_version = config.version ?? "1.0.0"

Read schemas/SCHEMA_CHANGELOG.json
target_version = changelog.current_version

if current_version == target_version:
  → "Configuration at v{target_version}. No migration needed."
  → Continue to step 2

if current_version < target_version:
  → "Schema update available: v{current_version} → v{target_version}"
  → Show migration plan:
    - List required changes (automatic)
    - List optional features (will ask)
  → Ask: "Apply migrations? (Y/n)"
  → if yes:
    - Apply required migrations automatically
    - Ask about optional features
    - Update version field
    - Write updated config
  → Continue to step 2
```

**Migration Types:**

| Type | Behavior |
|------|----------|
| `add_field` (required) | Auto-apply using defaults |
| `add_section` (optional) | Ask user |
| `rename_field` | Auto-apply |
| `remove_field` | Auto-apply |
| `make_required` | Auto-apply using defaults |
| `change_value` | Auto-apply: resolve current value (check `.env` if `{env.}` pattern), use default if unresolved |

**Special migration v2.2.0 → v2.3.0 (TT_TEMPO_BASE_URL):**

If `time_tracking.sync.tempo.base_url` equals `"{env.TT_TEMPO_BASE_URL}"`:
1. Read `TT_TEMPO_BASE_URL` from `.env` file
2. If found: replace with the resolved value
3. If not found: replace with default `"https://api.tempo.io"`

### 2. Detect Mode

After schema migration, determine which mode to run:

```
if time_tracking section exists in config AND --force NOT provided:
  → MODE = "user-onboard"
  → Show: "✅ Project config found (v{version}). Starting user setup..."
  → Show summary of configured project features:
    - CSV file: {csv_file}
    - Calendar sync: configured / not configured
    - Tempo sync: configured / not configured
    - Pricing: configured / not configured
  → Continue to User-Onboard Steps (U1-U5)

if --force provided:
  → MODE = "full-init"
  → "Force mode: resetting to default values."
  → Continue to Full-Init Steps (F1-F14)

if time_tracking section does NOT exist:
  → MODE = "full-init"
  → Continue to Full-Init Steps (F1-F14)
```

---

## User-Onboard Steps

These steps run when project config already exists. They only configure user-specific settings (`.env` variables, symlinks, directories).

### U1. Check environment variables

1. Read `.env` file if it exists
2. Check if `OPENCODE_USER_EMAIL` is set
3. If set, show current value and ask user if they want to change it
4. If not set, ask user for their email address
5. Validate email format (must contain `@`)
6. Create or update `.env` with `OPENCODE_USER_EMAIL=<email>`

### U2. Create symlink and directories

**Symlink:** Time tracking data is stored in the user's home directory (`~/time_tracking/`).

1. Check if symlink `.opencode/time_tracking` already exists:
   - If exists and points to `~/time_tracking`: Skip with message "Symlink already exists: .opencode/time_tracking → ~/time_tracking"
   - If exists but points elsewhere: Warn user and ask to overwrite
   - If not exists: Continue to step 2

2. Ask: "Create symlink .opencode/time_tracking → ~/time_tracking?"
   - Use mcp_question with options: "Yes (Recommended)", "No"
   - Set custom: false

3. If user confirms:
   1. Create `~/time_tracking/` directory if it does not exist:
      ```bash
      mkdir -p ~/time_tracking
      ```
   2. Create symlink:
      ```bash
      ln -sfn "$HOME/time_tracking" .opencode/time_tracking
      ```
   3. Verify symlink works: `ls -la .opencode/time_tracking/`
   4. Inform user: "Symlink created: .opencode/time_tracking → ~/time_tracking"

4. If user declines:
   - Warn: "Without symlink, you'll need to use absolute paths or grant external directory permissions."

**Directories:** Create configured directories if they do not exist:

1. Create parent directory of `csv_file` if it does not exist
2. Create `charts_dir` if it does not exist
3. Create `reports_dir` if it does not exist
4. Report each created directory to user

### U3. Configure calendar sync env variables (conditional)

**Only run if `sync.calendar` section exists in project config.**

If `sync.calendar` is NOT configured: Skip with message "Calendar sync: not configured in project. Skipping."

If `sync.calendar` IS configured:

1. Check if `TT_SOURCE_CALENDAR_ID` is set in `.env`
2. If not set, ask: "Source calendar ID (your primary calendar for reading meetings):"
   - Example: `your-email@company.com`
   - Validate: non-empty
3. If set, show current value and ask if user wants to change it

4. Check if `TT_BOOKING_CALENDAR_ID` is set in `.env`
5. If not set, ask: "Booking calendar ID (target calendar for writing booking events):"
   - Example: `c_abc123@group.calendar.google.com`
   - Validate: non-empty
6. If set, show current value and ask if user wants to change it

7. Update `.env` with both variables

### U4. Configure Tempo sync env variables (conditional)

**Only run if `sync.tempo` section exists in project config.**

If `sync.tempo` is NOT configured: Skip with message "Tempo sync: not configured in project. Skipping."

If `sync.tempo` IS configured:

1. Check if `TT_TEMPO_API_TOKEN` is set in `.env`
2. If not set, ask: "Tempo API Token (from Tempo > Settings > API Integration):"
   - Validate: non-empty
3. If set, show "***configured***" and ask if user wants to change it

4. Check if `TT_ATLASSIAN_ACCOUNT_ID` is set in `.env`
5. If not set, ask: "Your Atlassian Account ID:"
   - Hint: "Find via: curl -u email:token https://your-domain.atlassian.net/rest/api/3/myself | jq -r '.accountId'"
   - Validate: non-empty
6. If set, show current value and ask if user wants to change it

7. Update `.env` with both variables

### U5. Show user-onboard summary

```
"User Setup Complete!"
""
"Updated files:"
"  ✅ .env - Environment variables"
"  ✅ .opencode/time_tracking → ~/time_tracking (symlink)"
""
"Environment variables:"
"  OPENCODE_USER_EMAIL: {email}"
"  TT_SOURCE_CALENDAR_ID: {value or 'not configured'}"
"  TT_BOOKING_CALENDAR_ID: {value or 'not configured'}"
"  TT_TEMPO_API_TOKEN: {configured / not configured}"
"  TT_ATLASSIAN_ACCOUNT_ID: {value or 'not configured'}"
""
"Project config was already configured (v{version}). No project settings changed."
""
"Next steps:"
"  /time-tracking.booking-proposal - Generate booking proposal"
"  /time-tracking.sync-calendar - Sync to Google Calendar (if configured)"
"  /time-tracking.sync-tempo - Sync to JIRA Tempo (if configured)"
"  /time-tracking.timesheet - View timesheet"
```

---

## Full-Init Steps

These steps run when no project config exists or `--force` is used. This is the admin/first-time setup flow.

### F1. Check for existing configuration

1. Read `.opencode/opencode-project.json` if it exists
2. Check if `time_tracking` section exists
3. If section exists and `--force` not provided:
   1. Use existing values as defaults for all prompts
   2. Inform user: "Existing configuration found. Current values shown as defaults."
4. If `--force` provided:
   1. Ignore existing values and use standard defaults
   2. Inform user: "Force mode: resetting to default values."

### F2. Check environment variables

1. Read `.env` file if it exists
2. Check if `OPENCODE_USER_EMAIL` is set
3. If set, show current value and ask user if they want to change it
4. If not set, ask user for their email address
5. Validate email format (must contain `@`)
6. Create or update `.env` with `OPENCODE_USER_EMAIL=<email>`

### F3. Create symlink to user's time_tracking directory

Time tracking data is stored in the user's home directory (`~/time_tracking/`). To avoid external directory permission prompts and ensure portability across users, create a symlink in the project directory.

1. Check if symlink `.opencode/time_tracking` already exists:
   - If exists and points to `~/time_tracking`: Skip with message "Symlink already exists: .opencode/time_tracking → ~/time_tracking"
   - If exists but points elsewhere: Warn user and ask to overwrite
   - If not exists: Continue to step 2

2. Ask: "Create symlink .opencode/time_tracking → ~/time_tracking?"
   - Use mcp_question with options: "Yes (Recommended)", "No"
   - Set custom: false

3. If user confirms:
   1. Create `~/time_tracking/` directory if it does not exist:
      ```bash
      mkdir -p ~/time_tracking
      ```
   2. Create symlink:
      ```bash
      ln -sfn "$HOME/time_tracking" .opencode/time_tracking
      ```
   3. Verify symlink works: `ls -la .opencode/time_tracking/`
   4. Inform user: "Symlink created: .opencode/time_tracking → ~/time_tracking"

4. If user declines:
   - Warn: "Without symlink, you'll need to use absolute paths or grant external directory permissions."
   - Continue with absolute paths in subsequent prompts (e.g., `~/time_tracking/time-tracking.csv`)

**Why symlink?**
- No external directory permissions needed (path is "local" to project)
- Each user's symlink points to their own `~/time_tracking`
- Portable across team members
- Symlink is gitignored (user-specific)

### F4. Configure calendar sync (optional)

1. Ask user: "Configure calendar sync for booking proposals? (y/N)"
2. If user confirms:
   1. Check if `TT_SOURCE_CALENDAR_ID` is set in `.env`
   2. Ask: "Source calendar ID (your primary calendar for reading meetings):"
      - Show current value if set
      - Example: `your-email@company.com`
      - Validate: non-empty
   3. Check if `TT_BOOKING_CALENDAR_ID` is set in `.env`
   4. Ask: "Booking calendar ID (target calendar for writing booking events):"
      - Show current value if set
      - Example: `c_abc123@group.calendar.google.com`
      - Validate: non-empty
   5. Update `.env` with both variables
   6. Add `sync.calendar` section to `time_tracking` config with `{env.*}` references:
      ```json
      {
        "sync": {
          "calendar": {
            "source_calendar_id": "{env.TT_SOURCE_CALENDAR_ID}",
            "booking_calendar_id": "{env.TT_BOOKING_CALENDAR_ID}",
            "ticket_pattern": "([A-Z]+-\\d+)",
            "account_pattern": "(TD_[A-Z0-9_]+)",
            "filter": {
              "exclude_title_patterns": ["^\\[PRIVAT\\]"],
              "require_attendees": false,
              "require_accepted": true,
              "exclude_all_day": true
            }
          }
        }
      }
      ```
   7. Inform user: "Calendar sync configured. Values stored in .env, config references in opencode-project.json."
   8. Ask: "Configure calendar event filtering? (Y/n)"
   9. If user confirms (default: yes):
      1. Ask: "Regex patterns to exclude events by title (comma-separated):"
         - Show current value if set, otherwise show default: `^\\[PRIVAT\\]`
         - Example: `^\\[PRIVAT\\], ^\\[PERSONAL\\], Fokuszeit`
         - Split by comma, trim whitespace
         - Store as array: `["^\\[PRIVAT\\]"]`
      2. Ask: "Require events to have attendees? (y/N)"
         - Default: `false`
         - Hint: "If yes, events without attendees (personal blockers) are excluded"
      3. Ask: "Require events to be accepted? (Y/n)"
         - Default: `true`
         - Hint: "If yes, only events you've accepted are included"
      4. Ask: "Exclude all-day events? (Y/n)"
         - Default: `true`
         - Hint: "If yes, events without specific times are excluded"
   10. Update `filter` section in `sync.calendar` config with user's choices
   11. Inform user: "Calendar filter configured. Events matching exclude patterns or failing criteria will be skipped."

### F5. Configure Tempo sync (optional)

1. Ask user: "Configure Tempo sync for time tracking? (y/N)"
2. If user confirms:
   1. Check if `TT_TEMPO_API_TOKEN` is set in `.env`
   2. Ask: "Tempo API Token (from Tempo > Settings > API Integration):"
      - Show "***configured***" if already set
      - Validate: non-empty
   3. Ask: "Tempo API Base URL:"
      - Use mcp_question with options:
        - "https://api.tempo.io (Recommended)"
        - "https://api.eu.tempo.io (EU)"
      - Set custom: true (allow other URLs)
   4. Check if `TT_ATLASSIAN_ACCOUNT_ID` is set in `.env`
   5. Ask: "Your Atlassian Account ID:"
      - Show current value if already set
      - Hint: "Find via: curl -u email:token https://your-domain.atlassian.net/rest/api/3/myself | jq -r '.accountId'"
      - Validate: non-empty
   6. Update `.env` with:
      ```bash
      TT_TEMPO_API_TOKEN=<token>
      TT_ATLASSIAN_ACCOUNT_ID=<account_id>
      ```
   7. Add `sync.tempo` section to `time_tracking` config:
      ```json
      {
        "sync": {
          "tempo": {
            "api_token": "{env.TT_TEMPO_API_TOKEN}",
            "base_url": "https://api.tempo.io",
            "atlassian_account_id": "{env.TT_ATLASSIAN_ACCOUNT_ID}"
          }
        }
      }
      ```
      Note: `base_url` is stored as a direct value (project config), not as an `{env.}` reference.
   8. Inform user: "Tempo sync configured. Token stored in .env (keep it secret!)."

### F6. Configure required settings

Ask user for each setting. Validate each input:

1. Ask for `csv_file` (default: `.opencode/time_tracking/time-tracking.csv`, validate: non-empty path)
2. Ask for `global_default.issue_key` (validate: format `^[A-Z]+-\d+$`)
3. Ask for `global_default.account_key` (validate: non-empty string)
4. Ask for `charts_dir` (default: `.opencode/time_tracking/charts/`, validate: non-empty path)
5. Ask for `reports_dir` (default: `.opencode/time_tracking/reports/`, validate: non-empty path)

### F7. Configure agent defaults (optional)

1. Ask user: "Configure agent-specific defaults? (y/N)"
2. If user confirms, iterate through each agent (`@developer`, `@reviewer`, `@coordinator`, `@tester`):
   1. Ask: "Configure defaults for [agent]? (y/N)"
   2. If user confirms:
      1. Ask for `issue_key` override and validate format (`^[A-Z]+-\d+$`)
      2. Ask for `account_key` override (optional, allow empty)

### F8. Configure ignored agents

1. Show current ignored agents if already configured
2. Ask user: "Agents to exclude from automatic tracking (comma-separated)"
3. Use default `@time-tracking` if empty
4. Trim whitespace from each entry
5. Ensure each agent name starts with `@` prefix

### F9. Configure project whitelist (optional)

1. Ask user: "Restrict ticket detection to specific JIRA projects?"
   - Use mcp_question with 2 options:
     - "No (Recommended)" - Accept all ticket patterns with 2+ uppercase letters
     - "Yes" - Restrict to specific projects
   - Set `custom: false`
2. If user selects "Yes":
   1. Ask directly in chat: "Enter valid JIRA project keys (comma-separated, e.g., PROJ, SOSO):"
   2. Validate: Each key must match `^[A-Z]{2,}$` (at least 2 uppercase letters)
   3. If invalid: Show error "Invalid project key: {key}. Must be 2+ uppercase letters."
   4. Re-ask until valid input received
   5. Trim whitespace and convert to uppercase
   6. Store as array in `valid_projects`
3. If user selects "No": Do not add `valid_projects` (all patterns with 2+ letters accepted)

### F10. Configure pricing (optional)

1. Ask user: "Configure token pricing for cost calculation? (y/N)"
2. If user confirms:
   1. Add default Anthropic pricing template to configuration:
      ```json
      {
        "ratio": { "input": 0.8, "output": 0.2 },
        "default": { "input": 3, "output": 15 },
        "periods": [
          {
            "from": "2025-12-20",
            "models": {
              "anthropic/claude-opus-4": { "input": 15, "output": 75 },
              "anthropic/claude-opus-4-5": { "input": 5, "output": 25 },
              "anthropic/claude-sonnet-4": { "input": 3, "output": 15 },
              "anthropic/claude-sonnet-4-5": { "input": 3, "output": 15 }
            }
          }
        ]
      }
      ```
   2. Inform user: "Default Anthropic pricing added. Update prices in opencode-project.json if needed."

### F11. Create directories

1. Create parent directory of `csv_file` if it does not exist
2. Create `charts_dir` if it does not exist
3. Create `reports_dir` if it does not exist
4. Report each created directory to user

### F12. Write configuration

1. Read existing `.opencode/opencode-project.json` or create initial config:
   ```json
   {
     "$schema": "./node_modules/@techdivision/opencode-plugins/schemas/opencode-project.json",
     "version": "{target_version}"
   }
   ```
2. Merge new `time_tracking` section while preserving other sections
3. Ensure `$schema` and `version` fields are present (add if missing)
4. Write configuration back to file with proper JSON formatting (2-space indent)
5. Confirm to user: "Configuration saved to .opencode/opencode-project.json"

### F12a. Validate Configuration

After writing the configuration, validate it against the JSON Schema:

```bash
npx -p ajv-cli -p ajv-formats ajv validate -s schemas/opencode-project.json -d .opencode/opencode-project.json --spec=draft2020 -c ajv-formats --errors=text --all-errors
```

- If validation **passes**: Show "Schema validation passed."
- If validation **fails**: Show the errors to the user and offer to fix them interactively. Re-validate after fixes until the config passes.

### F13. Configure opencode.json

Register the time-tracking plugin and configure permissions.

1. Read existing `.opencode/opencode.json` or create with schema:
   ```json
   {
     "$schema": "https://opencode.ai/config.json"
   }
   ```

2. Ensure `plugin` array exists and contains `@techdivision/opencode-time-tracking`:
   - If `plugin` array doesn't exist: Create it with the plugin
   - If `plugin` array exists but doesn't contain the plugin: Add it
   - If already present: Skip (no duplicate)

3. Ensure `permission.external_directory` allows `~/time_tracking/**`:
   - Add if not present:
     ```json
     "permission": {
       "external_directory": {
         "~/time_tracking/**": "allow"
       }
     }
     ```
   - If `permission.external_directory` exists: Merge, don't overwrite existing entries

4. Configure time-tracking agent model:
   - Ask: "Which model should the time-tracking agent use?"
   - Use mcp_question with options:
     - "anthropic/claude-sonnet-4-0 (Recommended)"
     - "anthropic/claude-sonnet-4-5"
     - "anthropic/claude-opus-4-5"
   - Set custom: true (allow other models)
   - Add/update agent configuration:
     ```json
     "agent": {
       "time-tracking": {
         "model": "{selected_model}"
       }
     }
     ```

5. Write `.opencode/opencode.json` with proper JSON formatting (2-space indent)

6. Inform user: "Plugin registered in .opencode/opencode.json"

### F14. Show full-init summary

1. Display header: "Time Tracking Configuration Complete!"
2. List all created or updated files with checkmarks:
   - `.opencode/opencode.json` - Plugin registration and agent config
   - `.opencode/opencode-project.json` - Time tracking configuration
   - `.opencode/time_tracking` - Symlink to `~/time_tracking`
   - `.env` - Environment variables (email, calendar IDs)
3. List all created directories with checkmarks
4. Show all configured values:
   - CSV file path
   - Default account key
   - Charts directory
   - Reports directory
5. Show agent defaults if configured (agent → issue_key, account_key)
6. Show ignored agents list
7. Show valid projects whitelist (if configured)
8. Show pricing status (configured or not)
9. Show calendar sync status:
    - `TT_SOURCE_CALENDAR_ID`: configured / not configured
    - `TT_BOOKING_CALENDAR_ID`: configured / not configured
    - Filter settings (if calendar sync configured):
      - Exclude patterns: list patterns or "none"
      - Require attendees: yes / no
      - Require accepted: yes / no
      - Exclude all-day: yes / no
10. Show Tempo sync status:
    - `TT_TEMPO_API_TOKEN`: configured / not configured
    - `TT_ATLASSIAN_ACCOUNT_ID`: configured / not configured
    - `base_url`: value (project config)
11. Display next steps:
    - `/time-tracking.booking-proposal` - Generate booking proposal
    - `/time-tracking.sync-calendar` - Sync to Google Calendar (if configured)
    - `/time-tracking.sync-tempo` - Sync to JIRA Tempo (if configured)
    - `/time-tracking.timesheet` - View timesheet

## Validation Rules

| Field | Pattern | Error Message |
|-------|---------|---------------|
| Email | Contains `@` | "Invalid email format" |
| Issue Key | `^[A-Z]+-\d+$` | "Invalid issue key format. Expected: PROJ-123" |
| Project Key | `^[A-Z]{2,}$` | "Invalid project key: {key}. Must be 2+ uppercase letters." |
| Path | Non-empty | "Path cannot be empty" |
| Account Key | Non-empty (when required) | "Account key cannot be empty" |
