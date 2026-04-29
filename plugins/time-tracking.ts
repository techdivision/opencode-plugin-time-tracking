/**
 * OpenCode Time Tracking Plugin
 *
 * @package     @techdivision/opencode-plugin-time-tracking
 * @author      TechDivision GmbH
 * @license     MIT
 * @version     1.0.0
 *
 * @description
 * Automatically tracks session duration, tool usage, and token consumption,
 * exporting data to CSV for time tracking integration (e.g., Jira/Tempo).
 *
 * @usage
 * The plugin automatically tracks all sessions and exports data to CSV.
 * No manual configuration required beyond setting up the time_tracking
 * section in .opencode/opencode-project.json.
 */

// Re-export the plugin from the main package
export { plugin } from "../src/Plugin"
