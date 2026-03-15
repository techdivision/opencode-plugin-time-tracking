/**
 * @fileoverview Multi-provider API abstraction for LLM title generation.
 *
 * @remarks
 * Supports three API families detected via `model.api.npm`:
 * - Anthropic Messages API (`npm.includes("anthropic")`)
 * - Google Gemini API (`npm.includes("google")` without "anthropic")
 * - OpenAI Chat Completions (everything else, including Ollama)
 */

/**
 * Structured request data for an LLM API call.
 */
interface LlmRequest {
  /** Full endpoint URL */
  url: string

  /** HTTP headers including auth and content type */
  headers: Record<string, string>

  /** JSON-serialized request body */
  body: string
}

/**
 * Abstracts provider-specific API formats for title generation.
 *
 * @remarks
 * Pure static methods — no state, no side effects.
 * Provider detection uses `model.api.npm` string matching:
 *
 * | Pattern                  | API Format              |
 * |--------------------------|-------------------------|
 * | contains "anthropic"     | Anthropic Messages API  |
 * | contains "google" (only) | Google Gemini API       |
 * | everything else          | OpenAI Chat Completions |
 */
export class ProviderAdapter {
  /**
   * Builds a provider-specific HTTP request for title generation.
   *
   * @param providerNpm - The `model.api.npm` package identifier
   * @param apiUrl - Base API URL (from `model.api.url` or `provider.options.baseURL`)
   * @param apiModelId - The `model.api.id` identifier sent to the provider
   * @param apiKey - API key (can be `undefined` for local providers like Ollama)
   * @param systemPrompt - The system/title generation prompt
   * @param userPrompt - The user's original message text
   * @returns Structured request with url, headers, and body
   */
  static buildRequest(
    providerNpm: string,
    apiUrl: string,
    apiModelId: string,
    apiKey: string | undefined,
    systemPrompt: string,
    userPrompt: string
  ): LlmRequest {
    if (providerNpm.includes("anthropic")) {
      return ProviderAdapter.buildAnthropicRequest(
        apiUrl,
        apiModelId,
        apiKey,
        systemPrompt,
        userPrompt
      )
    }

    if (
      providerNpm.includes("google") &&
      !providerNpm.includes("anthropic")
    ) {
      return ProviderAdapter.buildGeminiRequest(
        apiUrl,
        apiModelId,
        apiKey,
        systemPrompt,
        userPrompt
      )
    }

    return ProviderAdapter.buildOpenAiRequest(
      apiUrl,
      apiModelId,
      apiKey,
      systemPrompt,
      userPrompt
    )
  }

  /**
   * Extracts the generated text from a provider-specific response.
   *
   * @param providerNpm - The `model.api.npm` package identifier
   * @param responseJson - The parsed JSON response body
   * @returns The extracted text content
   * @throws {Error} If the response structure is unexpected
   */
  static extractText(providerNpm: string, responseJson: unknown): string {
    const json = responseJson as Record<string, unknown>

    if (providerNpm.includes("anthropic")) {
      const content = json.content as Array<{ text?: string }> | undefined
      return content?.[0]?.text ?? ""
    }

    if (
      providerNpm.includes("google") &&
      !providerNpm.includes("anthropic")
    ) {
      const candidates = json.candidates as
        | Array<{ content?: { parts?: Array<{ text?: string }> } }>
        | undefined
      return candidates?.[0]?.content?.parts?.[0]?.text ?? ""
    }

    // OpenAI-compatible (default)
    const choices = json.choices as
      | Array<{ message?: { content?: string } }>
      | undefined
    return choices?.[0]?.message?.content ?? ""
  }

  /**
   * Builds an Anthropic Messages API request.
   *
   * @remarks
   * Anthropic uses a single user message with system prompt inlined.
   * Auth via `x-api-key` header.
   */
  private static buildAnthropicRequest(
    apiUrl: string,
    apiModelId: string,
    apiKey: string | undefined,
    systemPrompt: string,
    userPrompt: string
  ): LlmRequest {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      "anthropic-version": "2023-06-01",
    }

    if (apiKey) {
      headers["x-api-key"] = apiKey
    }

    return {
      url: `${apiUrl}/messages`,
      headers,
      body: JSON.stringify({
        model: apiModelId,
        max_tokens: 100,
        temperature: 0.3,
        messages: [
          {
            role: "user",
            content: `${systemPrompt}\n\n<text>${userPrompt}</text>`,
          },
        ],
      }),
    }
  }

  /**
   * Builds a Google Gemini API request.
   *
   * @remarks
   * Gemini uses `contents` array with `parts`.
   * Auth via `x-goog-api-key` header.
   * Model ID is part of the URL path.
   */
  private static buildGeminiRequest(
    apiUrl: string,
    apiModelId: string,
    apiKey: string | undefined,
    systemPrompt: string,
    userPrompt: string
  ): LlmRequest {
    const headers: Record<string, string> = {
      "content-type": "application/json",
    }

    if (apiKey) {
      headers["x-goog-api-key"] = apiKey
    }

    return {
      url: `${apiUrl}/models/${apiModelId}:generateContent`,
      headers,
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }],
          },
        ],
        generationConfig: {
          maxOutputTokens: 100,
          temperature: 0.3,
        },
      }),
    }
  }

  /**
   * Builds an OpenAI Chat Completions API request.
   *
   * @remarks
   * Used for OpenAI, OpenRouter, Ollama, and all other compatible providers.
   * Auth via `Authorization: Bearer` header (omitted if no key).
   */
  private static buildOpenAiRequest(
    apiUrl: string,
    apiModelId: string,
    apiKey: string | undefined,
    systemPrompt: string,
    userPrompt: string
  ): LlmRequest {
    const headers: Record<string, string> = {
      "content-type": "application/json",
    }

    if (apiKey) {
      headers["authorization"] = `Bearer ${apiKey}`
    }

    return {
      url: `${apiUrl}/chat/completions`,
      headers,
      body: JSON.stringify({
        model: apiModelId,
        max_tokens: 100,
        temperature: 0.3,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    }
  }
}
