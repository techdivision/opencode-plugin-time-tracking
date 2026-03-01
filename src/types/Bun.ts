/**
 * @fileoverview Global Bun type declarations.
 *
 * @remarks
 * This file declares the Bun global object for TypeScript.
 * The actual Bun runtime is provided by OpenCode at plugin load time.
 */

declare global {
  /** Bun runtime file system API */
  const Bun: {
    /**
     * Creates a file handle for the given path.
     *
     * @param path - The file path
     * @returns A file handle object
     */
    file(path: string): {
      /** Checks if the file exists */
      exists(): Promise<boolean>

      /** Parses the file as JSON */
      json(): Promise<unknown>

      /** Reads the file as text */
      text(): Promise<string>
    }

    /**
     * Writes content to a file.
     *
     * @param path - The file path
     * @param content - The content to write
     * @returns The number of bytes written
     */
    write(path: string, content: string): Promise<number>
  }
}

export {}
