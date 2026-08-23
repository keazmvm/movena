---
name: state-and-ipc
description: State management architecture with Zustand, TanStack Query caching, and Tauri IPC event flow. Use when modifying Zustand stores, TanStack Query hooks or keys, IPC wrappers in src/api/ipc.ts, or credential vault operations.
---

# State and IPC

Canonical documentation: [docs/ARCHITECTURE.md](../../../docs/ARCHITECTURE.md)

## Hooks and helpers

Derived visibility belongs in shared hooks such as `useCategories` and `useVisibleCatalog`.

## Diagnostics and IPC

- `useDebugStore`: Volatile diagnostics are sampled at most once per second, retained in a bounded ring.
- Components and stores call typed `tauriApi` methods (in `src/api/ipc.ts`), never bare `invoke`.
- Credential storage uses `services/credentialVault.ts` and native vault commands.

## Tests

When changing a store, query key, mapping, fallback, IPC payload, or event:

1. Update the nearest focused test.
2. Cover isolation, invalid input, errors, and boundary behavior as relevant.
3. Run the targeted test, TypeScript checks, and `npm run check` before handoff.
