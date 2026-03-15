/**
 * @fileoverview LLM-based title generation for time tracking worklog descriptions.
 *
 * @remarks
 * Orchestrates the title generation pipeline:
 * 1. Resolve provider from config at startup (synchronous, no SDK calls)
 * 2. Health-check the API URL at startup (single fetch with 3s timeout)
 * 3. On each session: extract conversation context, build request, call LLM
 * 4. Parse response and trim to max length
 *
 * All errors are caught and result in `null` — never throws.
 */

import type { MessageWithParts } from "../types/MessageWithParts"
import type { OpencodeClient } from "../types/OpencodeClient"
import type { TimeTrackingConfig } from "../types/TimeTrackingConfig"

import { MessageExtractor } from "../utils/MessageExtractor"
import { ProviderAdapter } from "./ProviderAdapter"

import "../types/Bun"

/** Default timeout for LLM requests in milliseconds. */
const DEFAULT_TIMEOUT_MS = 5000

/** Default maximum character length for generated titles. */
const DEFAULT_MAX_CHARS = 240

/** Timeout for the startup health-check in milliseconds. */
const HEALTH_CHECK_TIMEOUT_MS = 3000

/**
 * Default system prompt for title generation.
 */
/** Default locale for worklog description output. */
const DEFAULT_LOCALE = "de-DE"

const DEFAULT_PROMPT_TEMPLATE = `You receive a conversation between a developer and an AI coding assistant. Write a short worklog description of what was worked on. Output ONLY the description. Nothing else.

Rules:
- ALWAYS write in {{LOCALE}} language
- Write a natural, human-readable description as you would in a timesheet
- Describe what was actually done, not just filenames or technical keywords
- Maximum {{MAX_CHARS}} characters, single line
- No quotes, no prefixes like "Description:", no formatting
- If a ticket number appears, start with it
- Good example: "COPSPA-65: Fix Plugin-Startup-Hang durch Entfernen der SDK-Calls und Umstellung auf Config-basierte Provider-Aufloesung"
- Bad example: "package.json update"
- Bad example: "Session interaction"`

/** Pattern for `{env:VAR_NAME}` references in config values. */
const ENV_PATTERN = /^\{env:([^}]+)\}$/

/**
 * Resolved provider information for making LLM requests.
 */
interface ResolvedProvider {
  apiUrl: string
  apiModelId: string
  apiKey: string | undefined
}

/**
 * Generates worklog titles via direct LLM API calls.
 *
 * @remarks
 * Provider is resolved synchronously from config at startup.
 * The health-check verifies the API is reachable. If not, all subsequent
 * `generate()` calls return `null` immediately without network access.
 *
 * No visible footprint in OpenCode — pure `fetch()` calls to the provider API.
 * No SDK calls to the OpenCode server — everything is config-based.
 */
export class TitleGenerator {
  private readonly client: OpencodeClient
  private readonly config: TimeTrackingConfig
  private readonly configDir: string
  private readonly cachedProvider: ResolvedProvider | null
  private available = true
  private unavailableReason = ""

  constructor(
    client: OpencodeClient,
    config: TimeTrackingConfig,
    configDir: string
  ) {
    this.client = client
    this.config = config
    this.configDir = configDir

    // Resolve provider synchronously from config (no network, no SDK calls).
    // This ensures cachedProvider is available immediately, even before
    // the async health-check completes.
    if (this.config.title_generation?.enabled === false) {
      this.cachedProvider = null
      this.available = false
      this.unavailableReason = "disabled by config"
    } else {
      this.cachedProvider = this.resolveFromConfig()
      if (!this.cachedProvider) {
        this.available = false
        this.unavailableReason = "api_url and model not configured"
      }
    }
  }

  /**
   * Whether title generation is available.
   *
   * @remarks
   * Set during construction and updated by {@link checkAvailability}.
   * When `false`, {@link generate} returns `null` immediately.
   */
  get isAvailable(): boolean {
    return this.available
  }

  /**
   * Human-readable reason why title generation is unavailable.
   *
   * @remarks
   * Empty string when available. Used for toast messages.
   *
   * @example `"server not reachable (http://ai.tdservice.net:11434/v1)"`
   */
  get unavailableInfo(): string {
    return this.unavailableReason
  }

  /**
   * Checks API reachability via a lightweight health-check.
   *
   * @remarks
   * Provider is already resolved synchronously in the constructor.
   * This method only performs the async health-check `fetch()` with a 3s timeout.
   * Called as fire-and-forget from Plugin.ts — never blocks startup.
   */
  async checkAvailability(): Promise<void> {
    if (!this.cachedProvider) {
      return
    }

    try {
      const baseUrl = this.cachedProvider.apiUrl
      const controller = new AbortController()
      const timeout = setTimeout(
        () => controller.abort(),
        HEALTH_CHECK_TIMEOUT_MS
      )

      try {
        await fetch(baseUrl, { signal: controller.signal })
        // Any response (even 404) means the server is reachable
      } catch {
        this.available = false
        this.unavailableReason = `server not reachable (${baseUrl})`
      } finally {
        clearTimeout(timeout)
      }
    } catch {
      this.available = false
      this.unavailableReason = "startup check failed"
    }
  }

  /**
   * Generates a worklog description for the given session.
   *
   * @returns The generated description, or `null` if unavailable/failed.
   *          Never throws.
   */
  async generate(sessionID: string): Promise<string | null> {
    try {
      if (!this.cachedProvider) {
        return null
      }

      const messages = await this.fetchMessages(sessionID)
      if (!messages) return null

      const context = MessageExtractor.extractConversationContext(messages)
      if (!context) return null

      const timeoutMs =
        this.config.title_generation?.timeout_ms ?? DEFAULT_TIMEOUT_MS
      const maxChars =
        this.config.title_generation?.max_chars ?? DEFAULT_MAX_CHARS

      const systemPrompt = await this.loadPrompt(maxChars)

      const request = ProviderAdapter.buildRequest(
        this.cachedProvider.apiUrl,
        this.cachedProvider.apiModelId,
        this.cachedProvider.apiKey,
        systemPrompt,
        context
      )

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), timeoutMs)

      try {
        const response = await fetch(request.url, {
          method: "POST",
          headers: request.headers,
          body: request.body,
          signal: controller.signal,
        })

        if (!response.ok) return null

        const responseJson: unknown = await response.json()
        const text = ProviderAdapter.extractText(responseJson)

        return this.cleanTitle(text, maxChars)
      } finally {
        clearTimeout(timeout)
      }
    } catch {
      return null
    }
  }

  private async fetchMessages(
    sessionID: string
  ): Promise<MessageWithParts[] | null> {
    try {
      const result = await this.client.session.messages({
        path: { id: sessionID },
      } as Parameters<typeof this.client.session.messages>[0])

      return (result.data as MessageWithParts[]) ?? null
    } catch {
      return null
    }
  }

  private async loadPrompt(maxChars: number): Promise<string> {
    let template: string

    const promptPath = this.config.title_generation?.prompt
    if (promptPath) {
      try {
        const resolvedPath = promptPath.startsWith("/")
          ? promptPath
          : `${this.configDir}/${promptPath}`

        const file = Bun.file(resolvedPath)
        template = (await file.exists())
          ? await file.text()
          : DEFAULT_PROMPT_TEMPLATE
      } catch {
        template = DEFAULT_PROMPT_TEMPLATE
      }
    } else {
      template = DEFAULT_PROMPT_TEMPLATE
    }

    const locale = this.config.title_generation?.locale ?? DEFAULT_LOCALE

    return template
      .replace(/\{\{MAX_CHARS\}\}/g, String(maxChars))
      .replace(/\{\{LOCALE\}\}/g, locale)
  }

  /**
   * Resolves provider, model, API URL, and API key from config.
   *
   * @remarks
   * Purely synchronous — reads only from `this.config`. No network, no SDK calls.
   *
   * Both `config.title_generation.model` and `config.title_generation.api_url`
   * are required. Returns `null` if either is missing.
   */
  private resolveFromConfig(): ResolvedProvider | null {
    const titleConfig = this.config.title_generation

    const apiUrl = titleConfig?.api_url
    if (!apiUrl) return null

    const model = titleConfig?.model
    if (!model) return null

    // Support both "provider/model" and plain "model" formats.
    // For plain format (e.g., "llama3:8b"), the entire string is the model ID.
    const slashIndex = model.indexOf("/")
    const modelID = slashIndex === -1 ? model : model.slice(slashIndex + 1)
    const apiKey = this.resolveApiKey()

    return { apiUrl, apiModelId: modelID, apiKey }
  }

  /**
   * Resolves API key from config or environment variable.
   *
   * @remarks
   * Supports `{env:VAR_NAME}` syntax for environment variable references.
   * Returns `undefined` if not configured (OK for Ollama).
   */
  private resolveApiKey(): string | undefined {
    const configKey = this.config.title_generation?.api_key
    if (!configKey) return undefined

    const envMatch = ENV_PATTERN.exec(configKey)
    if (envMatch) return process.env[envMatch[1]] ?? undefined

    return configKey
  }

  private cleanTitle(text: string, maxChars: number): string | null {
    let cleaned = text
      // Remove common LLM prefixes that ignore instructions
      .replace(/^(Ticket:\s*N\/A\s*)?Description:\s*/i, "")
      .replace(/^(Title|Summary|Worklog|Description):\s*/i, "")
      // Remove wrapping quotes (e.g., "text" or 'text')
      .replace(/^["']+/, "")
      .replace(/["']+$/, "")
      // Remove markdown formatting
      .replace(/^[*#`]+|[*#`]+$/g, "")
      .replace(/\*\*/g, "")
      .replace(/\n/g, " ")
      .trim()

    if (cleaned.length === 0) return null

    if (cleaned.length > maxChars) {
      cleaned = cleaned.slice(0, maxChars - 3) + "..."
    }

    return cleaned
  }
}
