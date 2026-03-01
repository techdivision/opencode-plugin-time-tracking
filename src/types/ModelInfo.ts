/**
 * @fileoverview Model information type for tracking which LLM was used.
 */

/**
 * Information about the model used in a session.
 *
 * @remarks
 * Extracted from AssistantMessage events in the OpenCode SDK.
 * Used to calculate token costs per model.
 */
export interface ModelInfo {
  /**
   * Model identifier (e.g., "claude-opus-4", "gpt-5").
   *
   * @remarks
   * This is the model name as reported by the provider.
   */
  modelID: string

  /**
   * Provider identifier (e.g., "anthropic", "openai").
   *
   * @remarks
   * Combined with modelID to form the full model reference: `providerID/modelID`
   */
  providerID: string
}
