/**
 * @fileoverview Configuration loader for the time tracking plugin.
 */

import fs from "fs"
import { userInfo } from "os"

import type {
  OpencodeProjectConfig,
  TimeTrackingConfig,
} from "../types/TimeTrackingConfig"

import "../types/Bun"

/**
 * Environment variable name for user email.
 */
const ENV_USER_EMAIL = "OPENCODE_USER_EMAIL"

/**
 * Resolves {env:KEY} placeholders in configuration strings.
 * Recursively processes objects and arrays.
 *
 * @param value - The value to process (string, object, array, or primitive)
 * @returns The resolved value with {env:...} placeholders replaced
 *
 * @example
 * ```typescript
 * resolveEnvPlaceholders("{env:TT_AGENT_API_KEY}") // Returns process.env.TT_AGENT_API_KEY
 * resolveEnvPlaceholders({ api_key: "{env:TT_AGENT_API_KEY}" })
 * // Returns { api_key: "sk-..." }
 * ```
 */
function resolveEnvPlaceholders(value: any): any {
  // Handle strings: replace {env:KEY} with process.env.KEY
  if (typeof value === "string") {
    return value.replace(/{env:([^}]+)}/g, (_, key) => {
      return process.env[key] || `{env:${key}}`
    })
  }

  // Handle arrays: recursively process each element
  if (Array.isArray(value)) {
    return value.map(resolveEnvPlaceholders)
  }

  // Handle objects: recursively process each property
  if (value !== null && typeof value === "object") {
    const resolved: Record<string, any> = {}
    for (const [key, val] of Object.entries(value)) {
      resolved[key] = resolveEnvPlaceholders(val)
    }
    return resolved
  }

  // Return primitives (numbers, booleans, null) as-is
  return value
}

/**
 * Loads the plugin configuration from the project directory.
 *
 * @remarks
 * The configuration file is expected at `.opencode/opencode-project.json`
 * within the project directory, with a `time_tracking` section.
 *
 * The `user_email` is resolved from (in order of priority):
 * 1. `OPENCODE_USER_EMAIL` environment variable (set via `opencode-plugin-shell-env` or system)
 * 2. System username (fallback)
 */
export class ConfigLoader {
  /**
   * Loads the time tracking configuration from the filesystem.
   *
   * @param directory - The project directory path
   * @returns The configuration object, or `null` if not found or invalid
   *
   * @example
   * ```typescript
   * const config = await ConfigLoader.load("/path/to/project")
   * if (config) {
   *   console.log(config.csv_file)
   *   console.log(config.user_email) // Resolved from ENV, .env file, or system username
   * }
   * ```
   */
  static async load(directory: string): Promise<TimeTrackingConfig | null> {
    // Load .env as a fallback for process.env (in case plugins load in parallel in production).
    // During local development with symlinks in .opencode/plugins/, plugins load sequentially
    // and shell-env will have already populated process.env. In production with npm packages,
    // plugins may load in parallel, so we read .env directly as a safety net.
    // See: how-to-local-plugin-development.md for details.
    const envPath = `${directory}/.opencode/.env`
    try {
      const envFile = Bun.file(envPath)
      if (await envFile.exists()) {
        const envContent = await envFile.text()
        for (const line of envContent.split("\n")) {
          const trimmed = line.trim()
          if (trimmed.startsWith("OPENCODE_USER_EMAIL=")) {
            const value = trimmed.split("=")[1]?.replace(/["']/g, "").trim()
            if (value && !process.env[ENV_USER_EMAIL]) {
              process.env[ENV_USER_EMAIL] = value
            }
          }
        }
      }
    } catch {}

    const configPath = `${directory}/.opencode/opencode-project.json`

    try {
      const file = Bun.file(configPath)

      if (await file.exists()) {
        const projectConfig = (await file.json()) as OpencodeProjectConfig

        if (projectConfig.time_tracking) {
          const jsonConfig = projectConfig.time_tracking

          // Resolve user_email with fallback chain:
          // 1. Environment variable (loaded from .env or opencode-plugin-shell-env)
          // 2. System username
          const userEmail = process.env[ENV_USER_EMAIL] || userInfo().username

          // Resolve all {env:...} placeholders in the config recursively
          const resolvedConfig = resolveEnvPlaceholders(jsonConfig)

          return {
            ...resolvedConfig,
            user_email: userEmail,
          }
        }
      }

      return null
    } catch {
      return null
    }
  }
}
