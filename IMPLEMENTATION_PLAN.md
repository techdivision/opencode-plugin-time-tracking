# 📘 IMPLEMENTATION PLAN
## OpenCode Plugin nutzt lib-ts-time-tracking

**Status:** Ready to Implement  
**Estimated Time:** 22h (3 Tage)  
**Last Updated:** 2026-04-21

---

## TABLE OF CONTENTS

1. [Overview](#overview)
2. [Phase 1: Vorbereitung](#phase-1-vorbereitung)
3. [Phase 2: Refactoring](#phase-2-refactoring)
4. [Phase 3: Cleanup](#phase-3-cleanup)
5. [Phase 4: Testing](#phase-4-testing)
6. [Phase 5: Dokumentation](#phase-5-dokumentation)
7. [Checkliste](#checkliste)

---

## OVERVIEW

### Ausgangssituation
```
Aktueller Flow im OpenCode Plugin:
  session.status.idle Event
    ↓
  SessionManager.getAndDelete(sessionID)
    ↓
  DescriptionGenerator.generate() + TitleGenerator.generate()
    ↓
  Manuelle CsvEntryData Zusammenstellung
    ↓
  Writers aufrufen (CSV, Webhook)
```

### Zielfluss
```
Mit lib-ts-time-tracking Integration:
  session.status.idle Event
    ↓
  SessionManager.getAndDelete(sessionID) → SessionDataInterface Builder
    ↓
  TimeTrackingFacade.track() [aus Lib!]
    ↓
  SessionSummaryGenerator.generateSummary() [aus Lib!]
    ↓
  CSV + Webhook Output (von Lib)
```

### Kernerkenntnisse zur Implementierung

#### A. SessionManager - WRAPPER PATTERN (Option A)
```
lib-ts-time-tracking/src/services/OpenCodeSessionManager.ts (NEU)
  ↓ (generisch, keine SDK-Dependencies)
opencode-plugin-time-tracking/src/services/SessionManager.ts (Wrapper)
  ↓ (OpenCode-spezifisch)
EventHook.ts
```

**Gründe:**
- Zukunftssicherheit: Wenn OpenCode später Plugin-spezifische Methoden braucht
- Klare Verantwortung: SessionManager = OpenCode Facade
- Weniger Coupling: Plugin nicht direkt von Lib-Details abhängig

#### B. ConversationContextProvider - INLINE (Option A)
```typescript
// In EventHook.ts - beim idle Event:
const conversationContextProvider = async () => {
  const messages = await client.session.messages({ 
    sessionID,
    limit: 10
  })
  return messages.map(m => formatMessage(m)).join("\n")
}

// Dann beim track()-Call:
const sessionData: SessionDataInterface = {
  // ...
  conversationContext: conversationContextProvider
}
```

**Gründe:**
- KISS Principle - nur 5-10 Zeilen Code
- Aktuell nur ein Use-Case
- Direkter sichtbar im Event-Handler

#### C. Lazy Loading der Facade (Marketplace-Pattern)
```typescript
// In Plugin.ts
let facadePromise: Promise<TimeTrackingFacade> | null = null

async function getFacade(config): Promise<TimeTrackingFacade> {
  if (!facadePromise) {
    facadePromise = Promise.resolve(new TimeTrackingFacade(config))
  }
  return facadePromise
}
```

#### D. Error Handling mit Fallback
- Wenn ConversationContext fehlschlägt → Activity-Summary Fallback
- Wenn LLM API down → Activity-Summary Fallback
- Wenn CSV/Webhook Fehler → isoliert, andere Writer läuft weiter
- CSV wird IMMER geschrieben (Graceful Degradation)

---

## PHASE 1: VORBEREITUNG

**Dauer:** ~4h  
**Ziel:** Neue Dateien erstellen, Dependencies einrichten

### Step 1.1: Workspace Dependencies

**Datei:** `opencode-plugin-time-tracking/package.json`

Hinzufügen zu `dependencies`:
```json
{
  "dependencies": {
    "@opencode-ai/plugin": "^latest",
    "@techdivision/lib-ts-time-tracking": "workspace:*"
  }
}
```

**Command:** `npm install` oder `bun install`

### Step 1.2: Neue Datei - OpenCodeSessionManager in der Lib

**Pfad:** `lib-ts-time-tracking/src/services/OpenCodeSessionManager.ts`

**Inhalt:** Kopiere aus aktuellem `opencode-plugin-time-tracking/src/services/SessionManager.ts`

**Wichtig:**
- ❌ KEINE SDK-Imports (OpencodeClient, MessageWithParts, etc.)
- ✅ JA zu allen CRUD Operations für SessionData
- ✅ JA zu ActivityData, TokenUsage, etc. (Standard Types)

**Struktur:**
```typescript
export class OpenCodeSessionManager {
  private sessions = new Map<string, SessionData>()

  get(sessionID: string): SessionData | undefined { ... }
  has(sessionID: string): boolean { ... }
  create(sessionID: string, ticket: string | null): SessionData { ... }
  delete(sessionID: string): void { ... }
  getAndDelete(sessionID: string): SessionData | undefined { ... }
  addActivity(sessionID: string, activity: ActivityData): void { ... }
  addTokenUsage(sessionID: string, tokens: TokenUsage): void { ... }
  addCost(sessionID: string, cost: number): void { ... }
}
```

### Step 1.3: Neue Datei - SessionDataMapper im Plugin

**Pfad:** `opencode-plugin-time-tracking/src/adapters/SessionDataMapper.ts`

**Zweck:** Konvertiert OpenCode's SessionData → Lib's SessionDataInterface

**Inhalt:**
```typescript
import type { OpencodeClient } from "../types/OpencodeClient"
import type { SessionData } from "../types/SessionData"
import type { SessionDataInterface } from "@techdivision/lib-ts-time-tracking"

/**
 * Converts OpenCode plugin's SessionData to lib's SessionDataInterface.
 * Builds the ConversationContextProvider callback inline.
 */
export class SessionDataMapper {
  /**
   * Builds SessionDataInterface from SessionData.
   * Includes conversation context provider callback.
   */
  static build(
    session: SessionData,
    client: OpencodeClient,
    sessionID: string,
    config: { userEmail?: string }
  ): SessionDataInterface {
    // Format model as "provider/modelID"
    const modelString = session.model
      ? `${session.model.providerID}/${session.model.modelID}`
      : "unknown"

    // Build conversation context provider inline
    const conversationContextProvider = async (): Promise<string | null> => {
      try {
        const messages = await client.session.messages({
          sessionID,
          limit: 10,
        } as Parameters<typeof client.session.messages>[0])

        if (!messages || messages.length === 0) {
          return null
        }

        // Format messages as context string
        return messages
          .map((m) => {
            const role = m.info?.role || "unknown"
            const content = m.content || ""
            return `${role}: ${content}`
          })
          .join("\n")
      } catch {
        // Graceful degradation: if SDK call fails, return null
        // Lib will use activity-based fallback
        return null
      }
    }

    return {
      agent: session.agent?.name ?? "unknown",
      model: modelString,
      startTime: session.startTime,
      endTime: Date.now(),
      userEmail: config.userEmail,
      tokens: {
        input: session.tokenUsage.input,
        output: session.tokenUsage.output,
        cacheRead: session.tokenUsage.cacheRead,
        cacheWrite: session.tokenUsage.cacheWrite,
      },
      activities: session.activities,
      conversationContext: conversationContextProvider,
      ticket: session.ticket ?? undefined,
    }
  }
}
```

### Step 1.4: Export in lib's index.ts

**Datei:** `lib-ts-time-tracking/src/index.ts`

Hinzufügen:
```typescript
export { OpenCodeSessionManager } from "./services/OpenCodeSessionManager.js"
```

Stelle sicher dass `TimeTrackingFacade` auch exportiert ist.

### Step 1.5: Kompilation Check

```bash
# In lib-ts-time-tracking
npm run build
# oder
tsc --noEmit

# In opencode-plugin-time-tracking
npm run build
# oder
tsc --noEmit
```

**Muss ohne Fehler laufen!**

---

## PHASE 2: REFACTORING

**Dauer:** ~10h  
**Ziel:** Bestehende Dateien refactoren, Lib-Integration einbauen

### Step 2.1: Plugin.ts - Facade Initialization

**Datei:** `opencode-plugin-time-tracking/src/Plugin.ts`

**Imports - ENTFERNEN:**
```typescript
import { TitleGenerator } from "./services/TitleGenerator"
import { ProviderAdapter } from "./services/ProviderAdapter"
```

**Imports - HINZUFÜGEN:**
```typescript
import { TimeTrackingFacade } from "@techdivision/lib-ts-time-tracking"
```

**Neue Funktion - HINZUFÜGEN (vor createPlugin):**
```typescript
/**
 * Lazy-loads TimeTrackingFacade instance.
 * Follows Marketplace plugin pattern for single initialization.
 */
let facadePromise: Promise<TimeTrackingFacade> | null = null

async function getTimeTrackingFacade(
  config: TimeTrackingConfig
): Promise<TimeTrackingFacade> {
  if (!facadePromise) {
    facadePromise = Promise.resolve(new TimeTrackingFacade(config))
  }
  return facadePromise
}
```

**In createPlugin() - ENTFERNEN:**
```typescript
const titleGenerator = new TitleGenerator(client, config.time_tracking, configDir)
await titleGenerator.checkAvailability()
```

**In createPlugin() - ÄNDERN bei createEventHook():**

Alt:
```typescript
const eventHook = createEventHook(
  sessionManager,
  writers,
  client,
  ticketResolver,
  config,
  titleGenerator  // ← ENTFERNEN
)
```

Neu:
```typescript
const eventHook = createEventHook(
  sessionManager,
  writers,
  client,
  ticketResolver,
  config,
  (timeTrackingConfig) => getTimeTrackingFacade(timeTrackingConfig)  // ← HINZUFÜGEN
)
```

**Wichtig:** Die `createEventHook` Signature muss angepasst werden (siehe Step 2.2)

### Step 2.2: EventHook.ts - Core Refactoring

**Datei:** `opencode-plugin-time-tracking/src/hooks/EventHook.ts`

#### 2.2.1: Function Signature anpassen

Alt:
```typescript
export function createEventHook(
  sessionManager: SessionManager,
  writers: WriterService[],
  client: OpencodeClient,
  ticketResolver: TicketResolver,
  config: TimeTrackingConfig,
  titleGenerator: TitleGenerator
): EventHook {
```

Neu:
```typescript
export function createEventHook(
  sessionManager: SessionManager,
  writers: WriterService[],
  client: OpencodeClient,
  ticketResolver: TicketResolver,
  config: TimeTrackingConfig,
  getTimeTrackingFacade: (cfg: any) => Promise<TimeTrackingFacade>
): EventHook {
```

#### 2.2.2: Imports anpassen

**ENTFERNEN:**
```typescript
import { DescriptionGenerator } from "../utils/DescriptionGenerator"
import { TitleGenerator } from "../services/TitleGenerator"
import { extractSummaryTitle } from "../utils/MessageExtractor"
```

**HINZUFÜGEN:**
```typescript
import { SessionDataMapper } from "../adapters/SessionDataMapper"
import type { TimeTrackingFacade } from "@techdivision/lib-ts-time-tracking"
```

#### 2.2.3: Session Status Handler refactoren

**Finde:** `if (event.type === "session.status") {` (ungefähr Zeile 166)

**ENTFERNEN:** Zeilen ~200-224 (LLM Title + Activity Summary Logik)
```typescript
// ALT - ENTFERNEN:
const activitySummary = DescriptionGenerator.generate(session.activities)
let title = await extractSummaryTitle(client, sessionID)
if (!title) {
  try {
    title = await Promise.race([
      titleGenerator.generate(sessionID),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000)),
    ])
  } catch {
    title = null
  }
}
const description = title
  ? `${title} | ${activitySummary}`
  : activitySummary
```

**ERSETZEN mit (NEU):**
```typescript
// NEU - Nutze Lib's SessionSummaryGenerator via Facade
const sessionData = SessionDataMapper.build(session, client, sessionID, {
  userEmail: config.user_email,
})

const facade = await getTimeTrackingFacade(config.time_tracking)
const trackResult = await facade.track(sessionData)
const description = trackResult.summary.description
```

**ENTFERNEN:** Zeilen ~222-224 (Tool Summary)
```typescript
// ALT - ENTFERNEN:
const toolSummary = DescriptionGenerator.generateToolSummary(
  session.activities
)
```

**Ersetzen mit:**
```typescript
// NEU - Kommt von Lib
const notes = trackResult.summary.notes
```

**ENTFERNEN:** Zeilen ~260-276 (Manuelle CsvEntryData Zusammenstellung)
```typescript
// ALT - ENTFERNEN (große Block):
const entryData: CsvEntryData = {
  id: randomUUID(),
  userEmail: config.user_email,
  ticket: resolved.ticket,
  accountKey: resolved.accountKey,
  authorEmail: resolved.authorEmail,
  startTime: session.startTime,
  endTime,
  durationSeconds,
  description,
  notes: `Auto-tracked: ${toolSummary}`,
  tokenUsage: session.tokenUsage,
  cost: session.cost,
  model: modelString,
  agent: (resolved.primaryAgent ?? agentString)?.replace(/^@/, "") ?? null,
}
```

**ERSETZEN mit:**
```typescript
// NEU - Nutze trackResult.entry von Lib
const entryData: CsvEntryData = {
  ...trackResult.entry, // CSV entry kommt direkt von Lib!
  ticket: resolved.ticket, // OpenCode Resolving override
  accountKey: resolved.accountKey,
  agent: (resolved.primaryAgent ?? agentString)?.replace(/^@/, "") ?? null,
}
```

**ÄNDERN:** Writers aufrufen

Alt:
```typescript
// ALT - ENTFERNEN (Zeilen ~278-284):
const results: WriteResult[] = []
for (const writer of writers) {
  const result = await writer.write(entryData)
  results.push(result)
}
```

Neu:
```typescript
// NEU - Writers werden von Facade aufgerufen
// aber wir haben trotzdem access zu trackResult.csv und trackResult.webhook:
const results: WriteResult[] = [
  trackResult.csv,
  trackResult.webhook,
].filter(r => r !== undefined && r !== null)
```

**ÄNDERN:** Toast Feedback

Alt:
```typescript
if (!titleGenerator.isAvailable) {
  message += " (title generation NOT available)"
}
```

Neu:
```typescript
if (trackResult.summary.llmError) {
  message += ` (LLM: ${trackResult.summary.llmError})`
}
```

#### 2.2.4: Kompilation Test

```bash
npm run build
# oder
tsc --noEmit
```

### Step 2.3: SessionManager.ts - Wrapper Umwandlung

**Datei:** `opencode-plugin-time-tracking/src/services/SessionManager.ts`

**Imports - ÄNDERN:**
```typescript
import { OpenCodeSessionManager } from "@techdivision/lib-ts-time-tracking"
```

**Entfernen:** Private sessions Map

```typescript
// ALT - ENTFERNEN:
private sessions = new Map<string, SessionData>()
```

**Hinzufügen:**
```typescript
// NEU:
private manager = new OpenCodeSessionManager()
```

**Alle Methods - DELEGIEREN:**
```typescript
export class SessionManager {
  private manager = new OpenCodeSessionManager()

  get(sessionID: string): SessionData | undefined {
    return this.manager.get(sessionID)
  }

  has(sessionID: string): boolean {
    return this.manager.has(sessionID)
  }

  create(sessionID: string, ticket: string | null): SessionData {
    return this.manager.create(sessionID, ticket)
  }

  delete(sessionID: string): void {
    this.manager.delete(sessionID)
  }

  getAndDelete(sessionID: string): SessionData | undefined {
    return this.manager.getAndDelete(sessionID)
  }

  addActivity(sessionID: string, activity: ActivityData): void {
    this.manager.addActivity(sessionID, activity)
  }

  addTokenUsage(sessionID: string, tokens: TokenUsage): void {
    this.manager.addTokenUsage(sessionID, tokens)
  }

  addCost(sessionID: string, cost: number): void {
    this.manager.addCost(sessionID, cost)
  }
}
```

**Wichtig:** Keine neue Logik! Nur delegation.

---

## PHASE 3: CLEANUP

**Dauer:** ~2h  
**Ziel:** Duplikate löschen

### Dateien zum LÖSCHEN (6 Dateien, ~870 Zeilen)

```
✗ src/services/TitleGenerator.ts (332 Zeilen)
  Begründung: Ersetzt durch lib's SessionSummaryGenerator
  
✗ src/utils/DescriptionGenerator.ts (119 Zeilen)
  Begründung: Ersetzt durch lib's Activity-Summary Logic in SessionSummaryGenerator
  
✗ src/services/CsvWriter.ts (284 Zeilen)
  Begründung: 100% identisch mit lib's CsvWriter
  
✗ src/services/WebhookSender.ts (137 Zeilen)
  Begründung: 100% identisch mit lib's WebhookSender
  
✗ src/services/ProviderAdapter.ts
  Begründung: 100% identisch mit lib's ProviderAdapter
  
✗ src/utils/MessageExtractor.ts
  Begründung: Nur für extractSummaryTitle verwendet, nicht mehr nötig
```

### Dateien die BLEIBEN (OpenCode-spezifisch)

```
✓ src/services/SessionManager.ts (jetzt Wrapper)
✓ src/services/TicketResolver.ts (SDK-spezifisch, nicht in Lib)
✓ src/services/ConfigLoader.ts (OpenCode Config)
✓ src/hooks/ToolExecuteAfterHook.ts (Tool Activity Tracking)
✓ src/hooks/EventHook.ts (refactored)
✓ Alle Type Definitions in src/types/
✓ Alle anderen Utils
```

### Kompilation Test

Nach dem Löschen:
```bash
npm run build
```

Sollte trotzdem funktionieren ohne Fehler!

---

## PHASE 4: TESTING

**Dauer:** ~6h  
**Ziel:** Unit Tests, Integration Tests, E2E Test

### Step 4.1: Unit Tests

**Neu erstellen:** `tests/unit/adapters/SessionDataMapper.test.ts`

```typescript
import { describe, it, expect, vi } from "vitest"
import { SessionDataMapper } from "../../../src/adapters/SessionDataMapper"
import type { SessionData } from "../../../src/types/SessionData"
import type { OpencodeClient } from "../../../src/types/OpencodeClient"

describe("SessionDataMapper", () => {
  it("maps SessionData to SessionDataInterface correctly", () => {
    // Test hier
  })

  it("formats model as provider/modelID", () => {
    // Test hier
  })

  it("builds conversationContextProvider callback", async () => {
    // Test hier
  })

  it("handles null/undefined values gracefully", () => {
    // Test hier
  })

  it("catches client.session.messages errors", async () => {
    // Test hier
  })
})
```

**Überarbeiten:** `tests/unit/services/SessionManager.test.ts`

Stelle sicher dass SessionManager korrekt zu OpenCodeSessionManager delegiert.

### Step 4.2: Integration Test

**Neu erstellen:** `tests/integration/hooks/EventHook.time-tracking.test.ts`

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest"
import { createEventHook } from "../../../src/hooks/EventHook"
import type { MessageWithParts } from "../../../src/types/MessageWithParts"

describe("EventHook - Time Tracking Integration", () => {
  it("processes session.status.idle event with TimeTrackingFacade", async () => {
    // Mock setup
    // Event dispatch
    // Assertions
  })

  it("builds CSV entry from trackResult.entry", async () => {
    // Test hier
  })

  it("shows correct toast feedback on success", async () => {
    // Test hier
  })

  it("handles errors with graceful degradation", async () => {
    // Test hier
  })
})
```

### Step 4.3: E2E Test (Manuell)

1. **OpenCode Session starten:**
   ```bash
   opencode dev
   ```

2. **Tool aufrufen:** z.B. File editieren mit `edit`

3. **Session beenden:** Fenster schließen oder `stop`

4. **Verifizierungen:**
   - [ ] CSV wurde an konfiguriertem Ort geschrieben
   - [ ] Webhook wurde aufgerufen (falls konfiguriert)
   - [ ] Description enthält Activity Summary oder LLM-Text
   - [ ] Toast Feedback zeigt Ticket + Token Count
   - [ ] Keine Errors im Console

5. **Vergleich mit Alt-Output:**
   - [ ] CSV Format identisch
   - [ ] Description Layout ähnlich
   - [ ] Token Counts gleich

---

## PHASE 5: DOKUMENTATION

**Dauer:** ~2h  
**Ziel:** Dokumentation aktualisieren, Code Comments

### Step 5.1: README aktualisieren

**Datei:** `opencode-plugin-time-tracking/README.md`

**Änderungen:**
- Erwähne dass Plugin jetzt `lib-ts-time-tracking` nutzt
- Entferne Erklärungen zu TitleGenerator und DescriptionGenerator
- Aktualisiere Architecture Diagram (falls vorhanden)
- Mentioniere SessionDataMapper

**Beispiel-Text:**
```markdown
## Architecture

The plugin now uses [@techdivision/lib-ts-time-tracking](https://github.com/techdivision/lib-ts-time-tracking) 
for core time tracking functionality:

- **SessionSummaryGenerator:** Generates descriptions via LLM or activity fallback
- **TimeTrackingFacade:** Orchestrates summary generation, CSV writing, and webhook sending
- **OpenCodeSessionManager:** Manages session state across multiple OpenCode events

The plugin provides OpenCode-specific adapters:
- **SessionDataMapper:** Converts OpenCode session data to lib's interface
- **TicketResolver:** SDK-based JIRA ticket extraction
```

### Step 5.2: Code Comments

**In SessionDataMapper.ts:**
```typescript
/**
 * Converts OpenCode plugin's SessionData to lib's SessionDataInterface.
 * 
 * Key transformations:
 * - agent.name → string
 * - model provider/modelID formatting
 * - Token mapping with proper field names
 * - ConversationContextProvider callback building
 * 
 * Gracefully degrades if client.session.messages() fails.
 */
```

**In EventHook.ts (bei Facade.track call):**
```typescript
// Use TimeTrackingFacade from lib for summary generation and writing
// This replaces separate TitleGenerator and DescriptionGenerator calls
const facade = await getTimeTrackingFacade(config.time_tracking)
const trackResult = await facade.track(sessionData)
```

**In SessionManager.ts:**
```typescript
/**
 * Wrapper around OpenCodeSessionManager from lib.
 * 
 * Provides OpenCode-specific facade to the generic library implementation.
 * All state management is delegated to the library to ensure single source of truth.
 */
```

### Step 5.3: Git Commit

```bash
git add .
git commit -m "refactor: OpenCode plugin nutzt lib-ts-time-tracking

- Entfernen: TitleGenerator, DescriptionGenerator, CsvWriter, WebhookSender, ProviderAdapter
- Hinzufügen: SessionDataMapper für Konvertierung zu Lib-Interface
- Hinzufügen: OpenCodeSessionManager in Lib (generisch, wiederverwendbar)
- Refactor: EventHook nutzt TimeTrackingFacade mit Lazy Loading (Marketplace-Pattern)
- Refactor: SessionManager wird zu Wrapper um Lib's OpenCodeSessionManager
- Result: ~870 Zeilen Duplikation eliminiert, Single Source of Truth

Implementiert:
- Workspace Dependency: @techdivision/lib-ts-time-tracking
- Inline ConversationContextProvider mit SDK Integration
- Graceful Degradation für Fehlerbehandlung
- Activity-Summary Fallback wenn LLM fehlschlägt

Fixes #<ticket-number>"
```

---

## CHECKLISTE

### PRE-IMPLEMENTATION
- [ ] Plan verstanden und genehmigt
- [ ] Git Status clean oder committed
- [ ] Branch für Refactoring erstellt? (z.B. `feature/lib-integration`)
- [ ] Backup von kritischen Dateien? (optional)

### PHASE 1: VORBEREITUNG (4h)
- [ ] Step 1.1: Workspace Dependencies in package.json
- [ ] Step 1.1: `npm install` / `bun install` erfolgreich
- [ ] Step 1.2: OpenCodeSessionManager in Lib erstellt
- [ ] Step 1.3: SessionDataMapper im Plugin erstellt
- [ ] Step 1.4: Exports in lib's index.ts hinzugefügt
- [ ] Step 1.5: Kompilation erfolgreich (`npm run build`)

### PHASE 2: REFACTORING (10h)
- [ ] Step 2.1: Plugin.ts - Facade Initialization
  - [ ] Imports bereinigt
  - [ ] getFacade() Funktion hinzugefügt
  - [ ] createEventHook() aufgerufen mit getFacade
- [ ] Step 2.2: EventHook.ts - Core Refactoring
  - [ ] Function Signature angepasst
  - [ ] Imports bereinigt
  - [ ] Session Status Handler umgeschrieben
  - [ ] SessionDataMapper.build() Aufruf eingebaut
  - [ ] Facade.track() Aufruf eingebaut
  - [ ] CsvEntryData von trackResult.entry gebaut
  - [ ] Toast Feedback angepasst
- [ ] Step 2.3: SessionManager.ts - Wrapper Umwandlung
  - [ ] Private manager = new OpenCodeSessionManager()
  - [ ] Alle Methods delegieren
- [ ] Step 2.4: Kompilation erfolgreich

### PHASE 3: CLEANUP (2h)
- [ ] TitleGenerator.ts gelöscht
- [ ] DescriptionGenerator.ts gelöscht
- [ ] CsvWriter.ts gelöscht
- [ ] WebhookSender.ts gelöscht
- [ ] ProviderAdapter.ts gelöscht
- [ ] MessageExtractor.ts gelöscht
- [ ] Kompilation erfolgreich nach Löschen

### PHASE 4: TESTING (6h)
- [ ] SessionDataMapper Unit Tests erstellt
- [ ] SessionManager Unit Tests überarbeitet
- [ ] EventHook Integration Tests erstellt
- [ ] E2E Test durchgeführt (echte Session)
  - [ ] CSV geschrieben
  - [ ] Webhook aufgerufen (falls konfiguriert)
  - [ ] Description korrekt
  - [ ] Toast Feedback korrekt
  - [ ] Keine Errors im Console

### PHASE 5: DOKUMENTATION (2h)
- [ ] README.md aktualisiert
- [ ] Code Comments hinzugefügt
- [ ] Git Commit erstellt

### POST-IMPLEMENTATION
- [ ] Alle Tests grün (`npm run test`)
- [ ] TypeScript Compilation erfolgreich
- [ ] Dokumentation vollständig
- [ ] Pull Request erstellt (falls relevant)

---

## SUMMARY BY THE NUMBERS

| Metrik | Wert |
|--------|------|
| **Neue Dateien** | 2 (OpenCodeSessionManager, SessionDataMapper) |
| **Geänderte Dateien** | 4 (Plugin.ts, EventHook.ts, SessionManager.ts, index.ts) |
| **Gelöschte Dateien** | 6 (~870 Zeilen) |
| **Zeilen eingefügt** | ~200 |
| **Zeilen gelöscht** | ~1.050 |
| **Netto-Reduktion** | -850 Zeilen |
| **Neue Tests** | ~15 |
| **Estimated Time** | 22h (3 Tage) |
| **Code Quality** | ↑ (Single Source of Truth, weniger Duplikation) |

---

## KNOWN ISSUES & FALLBACKS

### Wenn ConversationContext fehlschlägt:
```
✅ SessionSummaryGenerator nutzt Activity-Summary Fallback
✅ CSV wird trotzdem geschrieben
✅ Toast zeigt erfolgreiche Speicherung
```

### Wenn LLM API down:
```
✅ SessionSummaryGenerator nutzt Activity-Summary Fallback
✅ Kein Error geworfen
✅ Graceful Degradation
```

### Wenn CSV/Webhook schreibt:
```
✅ Beide werden aufgerufen (parallel von Lib)
✅ Fehler sind isoliert (einer fehlgeschlagen = andere läuft weiter)
✅ Toast zeigt welcher Writer fehlgeschlagen
```

---

## HELPFUL RESOURCES

- [lib-ts-time-tracking](../lib-ts-time-tracking) - Source Library
- [TimeTrackingFacade Docs](../lib-ts-time-tracking/src/services/TimeTrackingFacade.ts)
- [SessionDataInterface](../lib-ts-time-tracking/src/types/SessionDataInterface.ts)
- [Marketplace Plugin](../plugin-marketplace/time-tracking) - Reference Implementation (Claude Code)

---

## NEXT STEPS

1. ✅ Plan verstanden
2. ⏳ Phase 1 starten: Workspace Dependencies + neue Dateien
3. ⏳ Phase 2 starten: Refactoring der bestehenden Dateien
4. ⏳ Phase 3 starten: Cleanup
5. ⏳ Phase 4 starten: Testing
6. ⏳ Phase 5 starten: Dokumentation

**Ready to implement? → Go!** 🚀
