/**
 * @fileoverview Configuration for LLM-based title generation.
 */

/**
 * Configuration for automatic title generation via LLM.
 *
 * @remarks
 * All fields are optional. When not configured, smart defaults are used
 * and title generation is enabled by default.
 *
 * To disable title generation entirely, set `enabled: false`.
 */
export interface TitleGenerationConfig {
  /**
   * Enables or disables title generation.
   *
   * @defaultValue `true`
   */
  enabled?: boolean

  /**
   * Model identifier in `"provider/model"` format.
   *
   * @remarks
   * Falls back to `small_model` from OpenCode config, then `model`.
   *
   * @example `"anthropic/claude-haiku-4-5"`, `"ollama/mistral:latest"`
   */
  model?: string

  /**
   * API key for the LLM provider.
   *
   * @remarks
   * Supports `{env:VAR_NAME}` syntax for environment variable references.
   * If not set, the key is resolved from the provider configuration.
   * Can be `undefined` for local providers like Ollama that require no auth.
   *
   * @example `"{env:ANTHROPIC_API_KEY}"`, `"sk-abc123"`
   */
  api_key?: string

  /**
   * Path to a custom prompt file.
   *
   * @remarks
   * Resolved relative to `opencode-project.json` (i.e., `<project>/.opencode/`).
   * Absolute paths are used as-is.
   * If not set, the built-in default prompt is used.
   *
   * @example `"prompts/title.txt"`
   */
  prompt?: string

  /**
   * Request timeout in milliseconds.
   *
   * @defaultValue `10000`
   */
  timeout_ms?: number

  /**
   * Maximum character length for generated titles.
   *
   * @defaultValue `80`
   */
  max_chars?: number
}
