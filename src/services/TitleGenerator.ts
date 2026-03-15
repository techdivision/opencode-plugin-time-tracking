/**
 * @fileoverview LLM-based title generation for time tracking worklog descriptions.
 *
 * @remarks
 * Orchestrates the title generation pipeline:
 * 1. Resolve provider at startup, check API availability (once)
 * 2. On each session: extract user prompt, build request, call LLM
 * 3. Parse response and trim to max length
 *
 * All errors are caught and result in `null` — never throws.
 */

import type { MessageWithParts } from "../types/MessageWithParts"
import type { OpencodeClient } from "../types/OpencodeClient"
import type { TimeTrackingConfig } from "../types/TimeTrackingConfig"

import { MessageExtractor } from "../utils/MessageExtractor"
import { ProviderAdapter } from "./ProviderAdapter"

import "../types/Bun"

/**
 * Known API base URLs for built-in providers.
 *
 * @remarks
 * Built-in providers don't expose their base URL in the providers API response.
 * The URL is hardcoded in the `@ai-sdk/*` npm packages which are bundled
 * into the OpenCode binary and not accessible to plugins at runtime.
 */
const KNOWN_API_URLS: Record<string, string> = {
  "@ai-sdk/anthropic": "https://api.anthropic.com/v1",
  "@ai-sdk/google": "https://generativelanguage.googleapis.com/v1beta",
  "@ai-sdk/openai": "https://api.openai.com/v1",
  "@ai-sdk/mistral": "https://api.mistral.ai/v1",
  "@ai-sdk/groq": "https://api.groq.com/openai/v1",
  "@ai-sdk/xai": "https://api.x.ai/v1",
  "@ai-sdk/deepinfra": "https://api.deepinfra.com/v1/openai",
  "@ai-sdk/cerebras": "https://api.cerebras.ai/v1",
  "@ai-sdk/cohere": "https://api.cohere.com/v2",
  "@ai-sdk/perplexity": "https://api.perplexity.ai",
  "@ai-sdk/togetherai": "https://api.together.xyz/v1",
  "@openrouter/ai-sdk-provider": "https://openrouter.ai/api/v1",
}

/**
 * Default model used when no model is configured.
 *
 * @remarks
 * Falls back to a local Ollama model to avoid API key issues with
 * cloud providers that use OAuth (e.g., Anthropic via `opencode auth`).
 */
const DEFAULT_MODEL = "ollama/mistral:latest"

/** Default timeout for LLM requests in milliseconds. */
const DEFAULT_TIMEOUT_MS = 5000

/** Default maximum character length for generated titles. */
const DEFAULT_MAX_CHARS = 80

/** Timeout for the startup health-check in milliseconds. */
const HEALTH_CHECK_TIMEOUT_MS = 3000

/**
 * Default system prompt for title generation.
 */
const DEFAULT_PROMPT = `You are a title generator for time tracking entries. Output ONLY a brief title. Nothing else.

Generate a brief title describing what work was done, suitable for a timesheet entry.

Rules:
- Use the same language as the user message
- Single line, no longer than 80 characters
- No explanations, no quotes, no prefixes
- Focus on the task/goal, not the tools used
- Keep exact: technical terms, filenames, ticket numbers
- Never include tool names (read, edit, bash, grep, glob)
- If a ticket number is mentioned, include it at the start
- If the message is a greeting or minimal, generate "Session interaction"`

/** Pattern for `{env:VAR_NAME}` references in config values. */
const ENV_PATTERN = /^\{env:([^}]+)\}$/

/**
 * Resolved provider information for making LLM requests.
 */
interface ResolvedProvider {
  npm: string
  apiUrl: string
  apiModelId: string
  apiKey: string | undefined
}

/**
 * Generates worklog titles via direct LLM API calls.
 *
 * @remarks
 * Provider is resolved once at startup via {@link checkAvailability}.
 * The health-check verifies the API is reachable. If not, all subsequent
 * `generate()` calls return `null` immediately without network access.
 *
 * No visible footprint in OpenCode — pure `fetch()` calls to the provider API.
 */
export class TitleGenerator {
  private readonly client: OpencodeClient
  private readonly config: TimeTrackingConfig
  private readonly configDir: string
  private cachedProvider: ResolvedProvider | null = null
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
  }

  /**
   * Whether title generation is available.
   *
   * @remarks
   * Set by {@link checkAvailability} at startup. When `false`,
   * {@link generate} returns `null` immediately.
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
   * Resolves the provider (once) and checks API reachability.
   *
   * @remarks
   * Must be called once at plugin startup. Caches the resolved provider
   * for all subsequent `generate()` calls. If the API is not reachable,
   * sets `isAvailable` to `false`.
   */
  async checkAvailability(): Promise<void> {
    try {
      // Disabled by config
      if (this.config.title_generation?.enabled === false) {
        this.available = false
        this.unavailableReason = "disabled by config"
        return
      }

      // Resolve provider (once)
      this.cachedProvider = await this.resolveProvider()

      if (!this.cachedProvider) {
        this.available = false
        this.unavailableReason = "could not resolve provider/model"
        return
      }

      // Health-check: try to reach the API base URL
      const baseUrl = this.cachedProvider.apiUrl
      const controller = new AbortController()
      const timeout = setTimeout(
        () => controller.abort(),
        HEALTH_CHECK_TIMEOUT_MS
      )

      try {
        await fetch(baseUrl, { signal: controller.signal })
        // Any response (even 404) means the server is reachable
        this.available = true
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
   * Generates a title for the given session.
   *
   * @returns The generated title, or `null` if unavailable/failed.
   *          Never throws.
   */
  async generate(sessionID: string): Promise<string | null> {
    try {
      if (!this.available || !this.cachedProvider) {
        return null
      }

      const messages = await this.fetchMessages(sessionID)
      if (!messages) return null

      const userPrompt = MessageExtractor.extractFirstUserPrompt(messages)
      if (!userPrompt) return null

      const systemPrompt = await this.loadPrompt()

      const request = ProviderAdapter.buildRequest(
        this.cachedProvider.npm,
        this.cachedProvider.apiUrl,
        this.cachedProvider.apiModelId,
        this.cachedProvider.apiKey,
        systemPrompt,
        userPrompt
      )

      const timeoutMs =
        this.config.title_generation?.timeout_ms ?? DEFAULT_TIMEOUT_MS
      const maxChars =
        this.config.title_generation?.max_chars ?? DEFAULT_MAX_CHARS

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
        const text = ProviderAdapter.extractText(
          this.cachedProvider.npm,
          responseJson
        )

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

  private async loadPrompt(): Promise<string> {
    const promptPath = this.config.title_generation?.prompt
    if (!promptPath) return DEFAULT_PROMPT

    try {
      const resolvedPath = promptPath.startsWith("/")
        ? promptPath
        : `${this.configDir}/${promptPath}`

      const file = Bun.file(resolvedPath)
      if (await file.exists()) return await file.text()

      return DEFAULT_PROMPT
    } catch {
      return DEFAULT_PROMPT
    }
  }

  /**
   * Resolves the provider, model, and API key for title generation.
   *
   * @remarks
   * Model resolution: `config.title_generation.model`
   *   → `small_model` → `model` → {@link DEFAULT_MODEL}
   */
  private async resolveProvider(): Promise<ResolvedProvider | null> {
    try {
      const configResult = await this.client.config.get()
      const opencodeConfig = configResult.data as
        | { model?: string; small_model?: string }
        | undefined

      const modelString =
        this.config.title_generation?.model ??
        opencodeConfig?.small_model ??
        opencodeConfig?.model ??
        DEFAULT_MODEL

      const slashIndex = modelString.indexOf("/")
      if (slashIndex === -1) return null

      const providerID = modelString.slice(0, slashIndex)
      const modelID = modelString.slice(slashIndex + 1)

      const providersResult = await this.client.config.providers()
      const providersData = providersResult.data as
        | { providers: Array<ProviderInfo> }
        | undefined

      if (!providersData?.providers) return null

      const provider = providersData.providers.find(
        (p) => p.id === providerID
      )
      if (!provider) return null

      const model = provider.models?.[modelID]
      if (!model) return null

      const apiUrl = TitleGenerator.resolveApiUrl(model, provider)
      if (!apiUrl) return null

      const apiKey = this.resolveApiKey(provider)

      return {
        npm: model.api?.npm ?? "@ai-sdk/openai-compatible",
        apiUrl,
        apiModelId: model.api?.id ?? modelID,
        apiKey,
      }
    } catch {
      return null
    }
  }

  /**
   * Resolves API base URL: `model.api.url` → `provider.options.baseURL` → known URLs.
   */
  private static resolveApiUrl(
    model: NonNullable<ProviderInfo["models"]>[string],
    provider: ProviderInfo
  ): string | undefined {
    if (model.api?.url) return model.api.url

    if (typeof provider.options?.baseURL === "string") {
      return provider.options.baseURL
    }

    const npm = model.api?.npm
    if (npm && KNOWN_API_URLS[npm]) return KNOWN_API_URLS[npm]

    return undefined
  }

  /**
   * Resolves API key: config → `provider.options.apiKey` → `provider.key` → env vars.
   */
  private resolveApiKey(provider: ProviderInfo): string | undefined {
    const configKey = this.config.title_generation?.api_key
    if (configKey) {
      const envMatch = ENV_PATTERN.exec(configKey)
      if (envMatch) return process.env[envMatch[1]] ?? undefined
      return configKey
    }

    const optionsKey = provider.options?.apiKey
    if (typeof optionsKey === "string" && optionsKey) return optionsKey

    if (provider.key) return provider.key

    if (Array.isArray(provider.env)) {
      for (const envVar of provider.env) {
        const value = process.env[envVar]
        if (value) return value
      }
    }

    return undefined
  }

  private cleanTitle(text: string, maxChars: number): string | null {
    let cleaned = text
      .replace(/^["'*#`]+|["'*#`]+$/g, "")
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

/**
 * Minimal provider type matching fields from `client.config.providers()`.
 */
interface ProviderInfo {
  id: string
  key?: string
  env?: string[]
  options?: Record<string, unknown>
  models?: Record<
    string,
    {
      api?: {
        id?: string
        url?: string
        npm?: string
      }
    }
  >
}
