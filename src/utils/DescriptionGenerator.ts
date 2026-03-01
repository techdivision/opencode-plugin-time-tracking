/**
 * @fileoverview Generates human-readable descriptions from activity data.
 */

import type { ActivityData } from "../types/ActivityData"

/**
 * Generates human-readable descriptions from tool activities.
 *
 * @remarks
 * Creates descriptions summarizing what tools were used and which files
 * were affected during a session.
 */
export class DescriptionGenerator {
  /**
   * Generates a human-readable description of activities.
   *
   * @param activities - Array of activity data from the session
   * @returns A formatted description string
   *
   * @remarks
   * Groups activities by type:
   * - File edits (edit + write tools)
   * - File reads
   * - Commands (bash)
   * - Searches (glob + grep)
   *
   * Also includes file names if 5 or fewer files were touched.
   *
   * @example
   * ```typescript
   * const desc = DescriptionGenerator.generate(activities)
   * // Returns: "3 file edit(s), 2 file read(s) - Files: index.ts, utils.ts"
   * ```
   */
  static generate(activities: ActivityData[]): string {
    if (activities.length === 0) {
      return "Chat session (no tool calls)"
    }

    const toolCounts = activities.reduce(
      (acc, a) => {
        acc[a.tool] = (acc[a.tool] || 0) + 1
        return acc
      },
      {} as Record<string, number>
    )

    const filesWorkedOn = new Set<string>()

    for (const activity of activities) {
      if (activity.file) {
        const fileName = activity.file.split("/").pop() || activity.file
        filesWorkedOn.add(fileName)
      }
    }

    const mainActivities: string[] = []

    if (toolCounts.edit || toolCounts.write) {
      mainActivities.push(
        `${(toolCounts.edit || 0) + (toolCounts.write || 0)} file edit(s)`
      )
    }

    if (toolCounts.read) {
      mainActivities.push(`${toolCounts.read} file read(s)`)
    }

    if (toolCounts.bash) {
      mainActivities.push(`${toolCounts.bash} command(s)`)
    }

    if (toolCounts.glob || toolCounts.grep) {
      mainActivities.push(
        `${(toolCounts.glob || 0) + (toolCounts.grep || 0)} search(es)`
      )
    }

    let description =
      mainActivities.length > 0
        ? mainActivities.join(", ")
        : `${activities.length} tool call(s)`

    if (filesWorkedOn.size > 0 && filesWorkedOn.size <= 5) {
      description += ` - Files: ${Array.from(filesWorkedOn).join(", ")}`
    } else if (filesWorkedOn.size > 5) {
      description += ` - ${filesWorkedOn.size} files`
    }

    return description
  }

  /**
   * Generates a compact tool usage summary.
   *
   * @param activities - Array of activity data from the session
   * @returns A compact summary string showing tool counts
   *
   * @example
   * ```typescript
   * const summary = DescriptionGenerator.generateToolSummary(activities)
   * // Returns: "read(5x), edit(3x), bash(2x)"
   * ```
   */
  static generateToolSummary(activities: ActivityData[]): string {
    const toolCounts = activities.reduce(
      (acc, a) => {
        acc[a.tool] = (acc[a.tool] || 0) + 1
        return acc
      },
      {} as Record<string, number>
    )

    return Object.entries(toolCounts)
      .map(([t, c]) => `${t}(${c}x)`)
      .join(", ")
  }
}
