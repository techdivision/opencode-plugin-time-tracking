/**
 * @fileoverview Configuration for LLM-based title generation.
 */

/**
 * Configuration for automatic title generation via LLM.
 *
 * @remarks
 * Both `model` and `api_url` are required for title generation to be active.
 * Without configuration, title generation is not available (graceful degradation).
 *
 * To explicitly disable title generation, set `enabled: false`.
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
   * Required for title generation. The provider prefix is informational only —
   * all requests use the Chat Completions API format.
   *
   * @example `"ollama/mistral:latest"`, `"openai/gpt-4o-mini"`
   */
  model?: string

  /**
   * API base URL for the LLM provider.
   *
   * @remarks
   * Required for title generation. The Chat Completions endpoint
   * (`/chat/completions`) is appended automatically.
   *
   * @example
   * - Ollama local: `"http://localhost:11434/v1"`
   * - Ollama remote: `"http://ai.tdservice.net:11434/v1"`
   * - OpenAI: `"https://api.openai.com/v1"`
   */
  api_url?: string

  /**
   * API key for the LLM provider.
   *
   * @remarks
   * Supports `{env:VAR_NAME}` syntax for environment variable references.
   * Can be omitted for providers that require no auth (e.g., Ollama).
   *
   * @example `"{env:OPENAI_API_KEY}"`, `"sk-abc123"`
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
   * @defaultValue `5000`
   */
  timeout_ms?: number

  /**
   * Maximum character length for generated titles.
   *
   * @defaultValue `240`
   */
  max_chars?: number

  /**
   * Output language for generated worklog descriptions.
   *
   * @remarks
   * Controls which language the LLM uses for the generated text.
   * Uses BCP 47 / IETF language tags.
   *
   * @defaultValue `"de-DE"`
   *
   * @example `"de-DE"`, `"en-US"`, `"fr-FR"`
   */
  locale?: string
}
