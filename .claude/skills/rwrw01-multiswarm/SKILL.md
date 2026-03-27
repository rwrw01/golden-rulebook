---
name: rwrw01-multiswarm
description: Orchestrate multi-agent swarms for large feature builds spanning 4+ sequential phases. Supervisor dispatches lean agents per phase, enforces sprint contracts, and runs separate evaluator agents after each phase.
argument-hint: "[plan file path]"
disable-model-invocation: true
---

# Multi-Agent Swarm Orchestratie

## Kernprincipe

Supervisor (jij) coördineert en bewaakt kwaliteit. Agents implementeren. Evaluators beoordelen. **Nooit dezelfde agent die implementeert en evalueert.**

---

## Agent prompts — altijd lean

Geef agents NOOIT volledige code of context in de prompt. Geef alleen:

1. Absoluut pad working directory
2. Plan file path — agent leest het zelf via Read/Grep
3. Tech stack samenvatting (3-5 regels, geen code)
4. Sprint contract (zie hieronder)
5. No-loops regel

**Waarom:** Volledige code in prompts verdubbelt token gebruik en creëert context-afhankelijkheid.

---

## Sprint contract (verplicht in elke agent prompt)

```
Definition of done voor deze fase:
- npx tsc --noEmit — 0 fouten
- npm run lint — 0 fouten
- npm run build — succesvol
- git status: alle gewijzigde én nieuwe bestanden gecommit
- Geen untracked source files achterlaten
- Commits conform plan commit targets
- Geen Co-Authored-By regels in commits
```

---

## Swarm uitvoeringspatroon

```
Per fase (sequentieel — elke fase hangt af van vorige):

1. Dispatch implementer agent (run_in_background: true)
   → Prompt: working dir + plan path + tech summary + sprint contract
   → Agent leest plan en source files zelf

2. Wacht op notificatie (NIET pollen of herhalen)

3. Controleer sprint contract:
   - git log --oneline -N (commits aanwezig?)
   - git status (untracked files?)
   - Indien gaps: dispatch fix-agent met specifieke opdracht

4. Dispatch evaluator agent (aparte agent, NIET de implementer)
   → Draait tests actief: tsc, lint, build, Playwright
   → Rapporteert pass/fail per criterium

5. Bij ✅ evaluator: volgende fase dispatchen
   Bij ❌: fix-agent dispatchen, dan opnieuw evalueren
```

---

## Evaluatie — scheiding verplicht

Agents beoordelen hun eigen werk altijd als goed, ook als het dat niet is.
Bron: *Anthropic Engineering — Harness Design for Long-Running Apps (2026)*

- **Implementer** = schrijft en commit code
- **Evaluator** = aparte agent, beoordeelt met actieve tests (niet screenshots)
- **Supervisor** = bewaakt voortgang, dispatcht, beslist bij blokkering

---

## Git discipline

Vorige fases laten soms untracked files achter. **Eerste stap van elke fase:**

```bash
git status  # controleer op untracked source files
# Indien aanwezig: cleanup commit vóór eigen werk
git add <untracked files>
git commit -m "chore: add untracked [fase] source files to git"
```

---

## Structured handoff artifact

Bij context reset of compaction: **memory file bijwerken**, geen summarization.
Inhoud per fase:

- Commit hash
- Welke bestanden gecommit (globaal, geen regelnummers)
- Sprint contract status (tsc ✅/❌, lint ✅/❌, build ✅/❌)
- Openstaande issues voor volgende fase

---

## No-loops regel (in elke agent prompt herhalen)

Dezelfde aanpak 2x gefaald = STOP. Rapporteer:
1. Wat geprobeerd
2. Wat gefaald (exact foutbericht)
3. Wat bekend vs. onbekend

Vraag supervisor om richting. Geen derde variatie.

---

$ARGUMENTS
