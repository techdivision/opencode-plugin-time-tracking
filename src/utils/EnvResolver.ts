/**
 * @fileoverview Environment variable resolver for configuration values.
 */

/**
 * Resolves environment variable placeholders in configuration values.
 *
 * @remarks
 * Replaces placeholders like `{env:VAR_NAME}` with actual environment variable values.
 * If the environment variable is not set, returns the original placeholder.
 *
 * @param value - The value that may contain env placeholders
 * @returns The resolved value with env vars substituted
 *
 * @example
 * ```typescript
 * process.env.API_KEY = "secret123"
 * resolveEnvVar("{env:API_KEY}") // Returns "secret123"
 * resolveEnvVar("normal-value") // Returns "normal-value"
 * ```
 */
export function resolveEnvVar(value: string | undefined): string | undefined {
  if (!value) return value
  
  // Match {env:VAR_NAME} pattern
  const envPattern = /\{env:([^}]+)\}/g
  
  return value.replace(envPattern, (match, varName) => {
    const envValue = process.env[varName]
    if (envValue) {
      return envValue
    }
    // If env var not found, return the original placeholder
    return match
  })
}

/**
 * Recursively resolves environment variables in an object.
 *
 * @remarks
 * Walks through all string values in an object and resolves env placeholders.
 * Non-string values are left unchanged.
 *
 * @param obj - The object to resolve
 * @returns A new object with resolved env vars
 *
 * @example
 * ```typescript
 * const config = {
 *   api_key: "{env:API_KEY}",
 *   api_url: "https://api.example.com",
 *   nested: {
 *     token: "{env:TOKEN}"
 *   }
 * }
 * const resolved = resolveEnvVarsInObject(config)
 * // resolved.api_key === "secret123"
 * // resolved.nested.token === "my-token"
 * ```
 */
export function resolveEnvVarsInObject<T extends Record<string, any>>(obj: T): T {
  const resolved: any = {}
  
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      resolved[key] = resolveEnvVar(value)
    } else if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      resolved[key] = resolveEnvVarsInObject(value)
    } else if (Array.isArray(value)) {
      resolved[key] = value.map(item => 
        typeof item === 'string' ? resolveEnvVar(item) : item
      )
    } else {
      resolved[key] = value
    }
  }
  
  return resolved
}
