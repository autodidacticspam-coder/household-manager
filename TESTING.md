# Testing

Tests should detect meaningful regressions before they reach the household. Run required checks and choose additional coverage for the affected behavior and risk; a coverage percentage alone does not establish correctness.

## Framework

This project uses Vitest 4 with React Testing Library and jsdom. Vite loads path aliases directly from `tsconfig.json`.

Run the full suite with:

```bash
npm test
```

## Test layers

- Unit tests cover pure business logic and live beside the source as `*.test.ts` or `*.test.tsx`.
- Integration tests exercise API and data-flow boundaries with external systems mocked.
- Component tests use React Testing Library to assert visible behavior and user interactions.
- End-to-end smoke tests exercise important workflows in a browser against a running app.

## Conventions

- Use Vitest's `describe`, `it`, and `expect` APIs.
- Assert meaningful behavior and exact outcomes, not merely that a value exists.
- Cover changed conditions and error paths when they can affect user-visible behavior, data integrity, or access controls.
- Add a focused regression test when it can reproduce the bug and distinguish the corrected behavior.
- Mock Supabase, network, filesystem, and other external dependencies in unit tests.
