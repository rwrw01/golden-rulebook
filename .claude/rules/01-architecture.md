# Architecture: 5-Layer + API-First (2025)

## Layer structure in code

Every project maps to 5 layers as top-level directories under `src/`:

| Layer | Directory | Contains | May depend on |
|-------|-----------|----------|---------------|
| Interaction | `src/ui/` | Pages, components, forms. Zero business logic. | Process (via API only) |
| Process | `src/process/` | Workflows, orchestration, RBAC, business rules | Integration |
| Integration | `src/integration/` | API routes, transformers, external adapters | Service |
| Service | `src/service/` | Domain logic, single-responsibility modules | Data |
| Data | `src/data/` | Repository pattern, migrations, ORM models | Nothing (leaf layer) |

## Dependency direction (NON-NEGOTIABLE)

DOWNWARD only: UI -> Process -> Integration -> Service -> Data.
NEVER import upward. NEVER skip a layer (e.g., UI importing from Data).

## API-First design

- OpenAPI 3.1 spec BEFORE implementation. Spec in `api/specs/{service}.yaml`.
- Generate types from spec: `npx openapi-typescript api/specs/{name}.yaml -o src/integration/types/{name}.ts`
- No hand-written API types — always generated from spec.
- REST best practices: versioned URLs (`/api/v1/`), RFC 9457 problem details, HAL links.
- Event-driven between services: notifications API pattern, not polling.

## Module boundaries

- Each layer exposes ONLY via `index.ts` barrel file.
- Internal helpers: `_` prefix (e.g., `_transform.ts`).
- Cross-layer: REST/GraphQL or message queue. Never direct imports across layers.

## Domain-specific standards (when applicable)

- **Dutch government projects**: ZGW APIs (Zaken, Documenten, Catalogi, Besluiten), NLX/FSC for inter-organization communication, NL Design System for UI components.
- **Other domains**: follow the equivalent domain standards and design systems.
