/**
 * @fileoverview Environment variable resolver for configuration values.
 */

/**
 * Resolves environment variable placeholders in a string value.
 *
 * @remarks
 * Replaces `{env:VAR_NAME}` placeholders with actual environment variable values.
 * If the environment variable is not set, the placeholder is left unchanged.
 *
 * @param value - The string value that may contain `{env:VAR_NAME}` placeholders
 * @returns The resolved string with environment variables substituted
 *
 * @example
 * ```typescript
 * process.env.API_KEY = "sk-123456"
 * resolveEnvVar("{env:API_KEY}") // Returns: "sk-123456"
 * resolveEnvVar("prefix-{env:API_KEY}-suffix") // Returns: "prefix-sk-123456-suffix"
 * resolveEnvVar("{env:MISSING}") // Returns: "{env:MISSING}" (unchanged)
 * ```
 */
export function resolveEnvVar(value: string): string {
  if (typeof value !== "string") {
    return value
  }

  return value.replace(/{env:([^}]+)}/g, (match, varName) => {
    const envValue = process.env[varName]
    return envValue !== undefined ? envValue : match
  })
}

/**
 * Recursively resolves environment variable placeholders in an object.
 *
 * @remarks
 * Traverses the entire object tree and resolves `{env:VAR_NAME}` placeholders
 * in all string values. Works with nested objects and arrays.
 *
 * @param obj - The object that may contain `{env:VAR_NAME}` placeholders in string values
 * @returns A new object with all environment variables resolved
 *
 * @example
 * ```typescript
 * process.env.API_KEY = "sk-123456"
 * const config = {
 *   api_key: "{env:API_KEY}",
 *   nested: {
 *     url: "https://api.example.com",
 *     token: "{env:API_TOKEN}"
 *   }
 * }
 * resolveEnvVarsInObject(config)
 * // Returns: {
 * //   api_key: "sk-123456",
 * //   nested: {
 * //     url: "https://api.example.com",
 * //     token: "{env:API_TOKEN}" (unchanged if not set)
 * //   }
 * // }
 * ```
 */
export function resolveEnvVarsInObject(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj
  }

  if (typeof obj === "string") {
    return resolveEnvVar(obj)
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => resolveEnvVarsInObject(item))
  }

  if (typeof obj === "object") {
    const resolved: any = {}
    for (const [key, value] of Object.entries(obj)) {
      resolved[key] = resolveEnvVarsInObject(value)
    }
    return resolved
  }

  return obj
}
