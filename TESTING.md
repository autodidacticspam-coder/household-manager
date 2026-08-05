# Testing

100% test coverage is the goal for safe, fast iteration. Tests turn quick changes into reliable changes by catching regressions before they reach the household.

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
- Add both branches when introducing a conditional.
- Add a focused regression test whenever a bug is fixed.
- Mock Supabase, network, filesystem, and other external dependencies in unit tests.
