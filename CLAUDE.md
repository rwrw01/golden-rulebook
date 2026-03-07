# CLAUDE.md — BlueDolphin Skills Catalog

## Project
Reusable audit and review skills catalog for M&I Partners projects.
Serves: iProva, Orbit, BlueDolphin, and future projects.
All skills prefixed `rwrw01-` for easy identification.

## Language
- Communication and reports: Dutch
- Code, configs, skill names/descriptions: English

## Reporting standard (all audit skills)
- **Severity levels**: CRITICAL > HIGH > MEDIUM > LOW
- **Per finding**: location (file:line), description, impact, fix, reference (CWE/OWASP)
- **Report structure**: Management summary -> Critical -> Medium -> Low -> Action list
- **Maturity scores**: 1 (absent) — 5 (best practice / exemplary)

## Skill conventions
- All skills: `disable-model-invocation: true` (manual trigger only)
- Names and descriptions in English (better matching)
- Report content in Dutch
- Use `$ARGUMENTS` for project-specific parameters
- Naming: `rwrw01-{function}` (kebab-case)
