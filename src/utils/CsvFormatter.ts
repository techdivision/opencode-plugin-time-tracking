/**
 * @fileoverview CSV formatting utilities.
 */

/**
 * Utility class for CSV formatting operations.
 *
 * @remarks
 * Provides static methods for escaping and formatting values
 * according to CSV standards.
 */
export class CsvFormatter {
  /**
   * Escapes a string value for CSV output.
   *
   * @param value - The string to escape
   * @returns The escaped string with double quotes doubled
   *
   * @example
   * ```typescript
   * CsvFormatter.escape('Say "Hello"')  // Returns: Say ""Hello""
   * ```
   */
  static escape(value: string): string {
    return value.replace(/"/g, '""')
  }

  /**
   * Formats a timestamp as an ISO date string (YYYY-MM-DD).
   *
   * @param timestamp - The Unix timestamp in milliseconds
   * @returns The formatted date string
   *
   * @example
   * ```typescript
   * CsvFormatter.formatDate(1704067200000)  // Returns: "2024-01-01"
   * ```
   */
  static formatDate(timestamp: number): string {
    return new Date(timestamp).toISOString().split("T")[0]
  }

  /**
   * Formats a timestamp as a time string (HH:MM:SS).
   *
   * @param timestamp - The Unix timestamp in milliseconds
   * @returns The formatted time string in local time
   *
   * @example
   * ```typescript
   * CsvFormatter.formatTime(1704067200000)  // Returns: "12:00:00"
   * ```
   */
  static formatTime(timestamp: number): string {
    return new Date(timestamp).toTimeString().split(" ")[0]
  }

  /**
   * Counts the number of columns in a CSV line.
   *
   * @param csvLine - A single line from a CSV file (with quoted fields)
   * @returns The number of columns
   *
   * @remarks
   * Handles quoted fields correctly by counting occurrences of `","` pattern.
   * Assumes all fields are double-quoted as our CSV writer produces.
   *
   * @example
   * ```typescript
   * CsvFormatter.countColumns('"a","b","c"')  // Returns: 3
   * CsvFormatter.countColumns('"single"')     // Returns: 1
   * ```
   */
  static countColumns(csvLine: string): number {
    if (!csvLine || csvLine.trim().length === 0) {
      return 0
    }

    // Count occurrences of "," which separates quoted fields
    // Add 1 because n separators means n+1 fields
    const matches = csvLine.match(/","/g)
    return matches ? matches.length + 1 : 1
  }
}
