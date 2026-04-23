# Epic: OpenCode Plugin nutzt lib-ts-time-tracking

| Attribut | Wert |
|----------|------|
| **ID** | EPIC-OPENCODE-01 |
| **Feature** | Time-Tracking Integration |
| **Name** | OpenCode Plugin nutzt lib-ts-time-tracking |
| **Priority** | MUST |
| **Size** | M (3 Tage) |
| **Target Duration** | 3 Tage |
| **Owner** | Patrick Mehringer |
| **Account** | 1100 \| KI Arbeitsweise |
| **Status** | Draft |
| **JIRA** | COPSPA-XXX |

---

## Beschreibung

**WER:** Als Entwickler  
**WAS:** möchte ich, dass das OpenCode Plugin die bereits existierende `lib-ts-time-tracking` Library vollständig nutzt  
**WARUM:** um Duplikationen zu eliminieren, eine Single Source of Truth zu etablieren und die Wartbarkeit zu verbessern.

Das OpenCode Plugin implementiert derzeit identische Services und Logik, die bereits in der `lib-ts-time-tracking` Library vorhanden sind. Dies führt zu ~870 Zeilen Duplikation und erschwert die Wartung und Weiterentwicklung.

---

## Ist-Zustand (2026-04-21)

### Redundante Implementierungen
- `TitleGenerator` (332 Zeilen) - identisch mit Lib's `SessionSummaryGenerator`
- `DescriptionGenerator` (119 Zeilen) - identisch mit Lib's Activity-Summary Logik
- `CsvWriter` (284 Zeilen) - 100% Duplikat der Lib
- `WebhookSender` (137 Zeilen) - 100% Duplikat der Lib
- `ProviderAdapter` - 100% Duplikat der Lib
- `MessageExtractor` - nur für LLM Context Handling

### Manuelle Service-Orchestrierung
- EventHook orchestriert Services manuell (~100 Zeilen Boilerplate)
- Keine Facade-Integration
- Keine Nutzung von Lib's `TimeTrackingFacade`

### Total Duplikation
- **~870 Zeilen identischer Code**
- Mehrfach zu wartende Services
- Keine zentrale Quelle für Bugfixes und Verbesserungen

---

## Ziel-Zustand

✅ OpenCode Plugin nutzt `TimeTrackingFacade` aus Lib  
✅ `SessionSummaryGenerator` als Single Source of Truth  
✅ `SessionManager` wird zu Wrapper um Lib's `OpenCodeSessionManager`  
✅ `SessionDataMapper` konvertiert OpenCode SessionData → SessionDataInterface  
✅ EventHook nutzt Lazy-Loading der Facade (Marketplace-Pattern)  
✅ ~850 Zeilen Code-Reduktion  
✅ Bessere Wartbarkeit und Testbarkeit  
✅ Konsistenz zwischen Marketplace Plugin und OpenCode Plugin  

---

## Akzeptanzkriterien

### AC1: Dependencies & Library Export
- [ ] `@techdivision/lib-ts-time-tracking` als workspace dependency in `package.json`
- [ ] Lib exportiert `OpenCodeSessionManager` in `src/index.ts`
- [ ] `TimeTrackingFacade` in Lib exportiert
- [ ] Kompilation erfolgreich in beiden Packages

### AC2: Library Services - OpenCodeSessionManager
- [ ] Neue Datei: `lib-ts-time-tracking/src/services/OpenCodeSessionManager.ts`
- [ ] Generische Session State Management (keine SDK-Dependencies)
- [ ] CRUD Operations: get, has, create, delete, getAndDelete, addActivity, addTokenUsage, addCost
- [ ] ~200 Zeilen Code

### AC3: Plugin Adapter - SessionDataMapper
- [ ] Neue Datei: `opencode-plugin-time-tracking/src/adapters/SessionDataMapper.ts`
- [ ] Konvertiert SessionData → SessionDataInterface
- [ ] Buildet ConversationContextProvider inline mit SDK Integration
- [ ] Graceful Degradation bei SDK Call Fehlern
- [ ] ~50 Zeilen Code

### AC4: Plugin.ts Refactoring
- [ ] Lazy-Loading Funktion für TimeTrackingFacade
- [ ] Keine TitleGenerator / ProviderAdapter Initialisierung mehr
- [ ] `createEventHook` mit getFacade Parameter aufgerufen
- [ ] Kompilation erfolgreich

### AC5: EventHook.ts Core Refactoring
- [ ] Session Status Handler refactored auf Facade
- [ ] SessionDataMapper.build() statt manueller Mapping
- [ ] TimeTrackingFacade.track() statt manueller Service-Orchestrierung
- [ ] trackResult.entry nutzen statt CsvEntryData manuell zusammensetzen
- [ ] Toast Feedback an neues Format angepasst
- [ ] ~80 Zeilen Code-Reduktion

### AC6: SessionManager.ts Wrapper-Umwandlung
- [ ] Private manager = new OpenCodeSessionManager()
- [ ] Alle Methods delegieren zu manager
- [ ] Keine neue Logik, nur Delegation
- [ ] Import von Lib kompatibel

### AC7: Redundante Dateien Gelöscht
- [ ] `src/services/TitleGenerator.ts` gelöscht (332 Zeilen)
- [ ] `src/utils/DescriptionGenerator.ts` gelöscht (119 Zeilen)
- [ ] `src/services/CsvWriter.ts` gelöscht (284 Zeilen)
- [ ] `src/services/WebhookSender.ts` gelöscht (137 Zeilen)
- [ ] `src/services/ProviderAdapter.ts` gelöscht
- [ ] `src/utils/MessageExtractor.ts` gelöscht
- [ ] Kompilation erfolgreich nach Löschen

### AC8: Unit Tests
- [ ] `tests/unit/adapters/SessionDataMapper.test.ts` erstellt
- [ ] `tests/unit/services/SessionManager.test.ts` überarbeitet
- [ ] Alle Tests grün
- [ ] Coverage für kritische Pfade

### AC9: Integration Tests
- [ ] `tests/integration/hooks/EventHook.time-tracking.test.ts` erstellt
- [ ] Event → Facade → Results Pfad getestet
- [ ] Alle Tests grün

### AC10: E2E Test
- [ ] Echte OpenCode Session durchgeführt
- [ ] CSV geschrieben und Format korrekt
- [ ] Webhook aufgerufen (falls konfiguriert)
- [ ] Description korrekt (Activity Summary oder LLM)
- [ ] Toast Feedback korrekt
- [ ] Keine Errors im Console

### AC11: Dokumentation & Code Quality
- [ ] README.md aktualisiert (Lib Integration erwähnt)
- [ ] Code Comments hinzugefügt (Mapper, Hook, Manager)
- [ ] Git Commit mit aussagekräftiger Message
- [ ] ~850 Zeilen Code-Reduktion erreicht

---

## Scope

### In Scope
✅ Lib-Integration in OpenCode Plugin  
✅ OpenCodeSessionManager als generischer Service  
✅ SessionDataMapper für OpenCode-spezifische Konvertierung  
✅ Lazy-Loading TimeTrackingFacade  
✅ Graceful Degradation Error Handling  
✅ ~870 Zeilen Duplikation eliminieren  
✅ Marketplace Plugin als Referenz nutzen  

### Out of Scope
❌ Marketplace Plugin ändern (bereits korrekt implementiert)  
❌ Lib selbst inhaltlich ändern (nur OpenCodeSessionManager hinzufügen)  
❌ Komplette Event-Architektur umschreiben  
❌ Code-Refactorings außerhalb von Time-Tracking  

---

## Deliverables

### Phase 1: Vorbereitung (4h)
- Lib exportiert OpenCodeSessionManager
- SessionDataMapper erstellt
- Dependencies aktualisiert
- Kompilation erfolgreich

### Phase 2: Refactoring (10h)
- Plugin.ts mit Lazy-Loading
- EventHook.ts komplett refactored
- SessionManager zu Wrapper
- Alle Importe angepasst

### Phase 3: Cleanup (2h)
- 6 redundante Dateien gelöscht
- Kompilation ohne Fehler

### Phase 4: Testing (6h)
- Unit Tests grün
- Integration Tests grün
- E2E Test erfolgreich
- CSV Output vergleich erfolgreich

### Phase 5: Dokumentation (2h)
- README updated
- Code Comments hinzugefügt
- Git Commit erstellt

---

## Design Pattern & Architektur

### 1. Wrapper Pattern für SessionManager
```
OpenCode Events
  ↓ (message.updated, message.part.updated, session.status.idle)
SessionManager (Wrapper im Plugin)
  ↓ delegates to
OpenCodeSessionManager (Generisch in Lib)
  ↓
State Management
```

**Grund:** Zukunftssicherheit - OpenCode-spezifische Features können ohne Lib-Änderung addiert werden.

### 2. Inline ConversationContextProvider
```
EventHook - session.status.idle handler
  ↓
SessionDataMapper.build()
  └─ Buildet async ConversationContextProvider inline
     ├─ client.session.messages({limit: 10})
     └─ Falls Error: return null (Graceful Degradation)
  ↓
TimeTrackingFacade.track(sessionData)
  └─ SessionSummaryGenerator.generateSummary()
     ├─ LLM Description (mit Context)
     └─ Fallback: Activity-Summary
```

**Grund:** KISS - 5-10 Zeilen Code, direkt sichtbar im Handler.

### 3. Lazy Loading Facade (Marketplace-Pattern)
```typescript
let facadePromise: Promise<TimeTrackingFacade> | null = null

async function getFacade(config): Promise<TimeTrackingFacade> {
  if (!facadePromise) {
    facadePromise = Promise.resolve(new TimeTrackingFacade(config))
  }
  return facadePromise
}
```

**Grund:** Single Initialization, reusable in allen Event-Handlers.

### 4. Error Handling: Graceful Degradation
- ConversationContext fails → Activity-Summary Fallback ✅
- LLM API down → Activity-Summary Fallback ✅
- CSV/Webhook Error → isoliert, andere läuft weiter ✅
- CSV wird IMMER geschrieben ✅

---

## Metriken & Erfolg-Indikatoren

| Metrik | Aktuell | Ziel | Status |
|--------|---------|------|--------|
| **Code Duplikation** | ~870 Zeilen | 0 | ⏳ |
| **Neue Dateien** | 0 | 2 | ⏳ |
| **Gelöschte Dateien** | 0 | 6 | ⏳ |
| **Zeilen gelöscht** | 0 | ~1.050 | ⏳ |
| **Zeilen hinzugefügt** | 0 | ~200 | ⏳ |
| **Netto Reduktion** | 0 | -850 | ⏳ |
| **Unit Tests** | ~0 | ~10 | ⏳ |
| **Integration Tests** | ~0 | ~5 | ⏳ |
| **Code Quality** | Duplikation | Single Source of Truth | ⏳ |
| **Komplexität** | Hoch (Manuelle Orchestrierung) | Niedrig (Facade) | ⏳ |

---

## Risiken & Fallbacks

### Risiko 1: TimeTrackingFacade.track() throws Error
- **Fallback:** Error caught, graceful degradation
- **Mitigation:** Marketplace Plugin zeigt dass es funktioniert
- **Action:** Siehe Error Handling oben

### Risiko 2: ConversationContext Call fails
- **Fallback:** SessionSummaryGenerator nutzt Activity-Summary
- **Mitigation:** Inline Error Handling in SessionDataMapper
- **Action:** null zurückgeben, Lib hat Fallback

### Risiko 3: Bun FileSystem Kompatibilität
- **Fallback:** CsvWriter aus Lib sollte in Bun laufen
- **Mitigation:** Marketplace Plugin zeigt es funktioniert
- **Action:** E2E Test verifiziert CSV-Schreiber

### Risiko 4: Type Inkompatibilität
- **Fallback:** SessionDataInterface/SessionData Mapping
- **Mitigation:** SessionDataMapper genau auf Types prüfen
- **Action:** TypeScript strict mode obligatorisch

---

## Referenzen

- 📘 [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) - Schritt-für-Schritt Anleitung
- 📚 [lib-ts-time-tracking](../lib-ts-time-tracking) - Source Library
- 🏪 [Marketplace Plugin](../plugin-marketplace/time-tracking) - Reference Implementation
- 📄 [README](./README.md) - Plugin Dokumentation
- 🔗 [COPSPA-55](https://techdivision.atlassian.net/browse/COPSPA-55) - Ähnliches Refactoring Ticket

---

## Änderungshistorie

| Datum | Version | Änderung | Autor |
|-------|---------|----------|-------|
| 2026-04-21 | 1.0 | Initial Draft | Patrick Mehringer |

---

## Zeitplan

| Phase | Aufgabe | Dauer | Kumulativ | Status |
|-------|---------|-------|----------|--------|
| 1 | Vorbereitung | 4h | 4h | ⏳ |
| 2 | Refactoring | 10h | 14h | ⏳ |
| 3 | Cleanup | 2h | 16h | ⏳ |
| 4 | Testing | 6h | 22h | ⏳ |
| 5 | Dokumentation | 2h | 24h | ⏳ |
| Buffer | Unexpected Issues | 2-4h | **~24-26h (3 Tage)** | ⏳ |

**Start:** <Datum ausfüllen>  
**Target Completion:** <Datum + 3 Tage>

---

## Notizen

- Siehe `IMPLEMENTATION_PLAN.md` für schritt-für-schritt Anleitung
- Marketplace Plugin (`plugin-marketplace/time-tracking`) als Referenz nutzen
- Lib-Codes in `lib-ts-time-tracking/src/` als Best Practice Quelle
- Graceful Degradation überall wo externe APIs involviert sind
- Alle Error Catches müssen silent sein (kein throw in EventHooks!)
- SessionManager Pattern bleibt: Plugin-spezifischer Wrapper über generischer Lib-Klasse
- Single Source of Truth für Time-Tracking Logic = Lib's SessionSummaryGenerator

