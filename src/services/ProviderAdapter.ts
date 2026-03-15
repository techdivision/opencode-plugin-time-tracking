/**
 * @fileoverview Chat Completions API adapter for LLM title generation.
 *
 * @remarks
 * Builds HTTP requests and parses responses for the Chat Completions API format
 * used by Ollama and other LLM providers.
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
 * Builds and parses Chat Completions API requests for title generation.
 *
 * @remarks
 * Pure static methods — no state, no side effects.
 */
export class ProviderAdapter {
  /**
   * Builds a Chat Completions API request.
   *
   * @param apiUrl - Base API URL (from `title_generation.api_url` config)
   * @param apiModelId - The model identifier sent to the provider
   * @param apiKey - API key (can be `undefined` for providers that require no auth)
   * @param systemPrompt - The system/title generation prompt
   * @param userPrompt - The user's original message text
   * @returns Structured request with url, headers, and body
   */
  static buildRequest(
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

  /**
   * Extracts the generated text from a Chat Completions response.
   *
   * @param responseJson - The parsed JSON response body
   * @returns The extracted text content, or empty string if not found
   */
  static extractText(responseJson: unknown): string {
    const json = responseJson as Record<string, unknown>
    const choices = json.choices as
      | Array<{ message?: { content?: string } }>
      | undefined
    return choices?.[0]?.message?.content ?? ""
  }
}
