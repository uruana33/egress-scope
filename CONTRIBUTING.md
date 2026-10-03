# Contributing

Thanks for your interest in improving EgressScope! Issues and pull requests
are welcome in Chinese or English.

## Setup

```bash
pnpm install --frozen-lockfile
pnpm worker:dev    # Vite + local Worker at http://127.0.0.1:8787
```

Optional upstream keys: copy `.dev.vars.example` to `.dev.vars` and fill in
what you need. Everything runs without keys; each one enables an extra data
source (see the README table).

## Before submitting a PR

```bash
pnpm lint           # oxlint
pnpm build          # typecheck + production bundle
pnpm test           # Worker dry-run + Node test suite
```

- `pnpm format` runs Prettier; the pre-commit hook formats staged files
  automatically via lint-staged.
- Match the existing style: TypeScript for `src/` (paths via `@/`), plain ESM
  JavaScript for `public/worker/`.
- UI copy is authored in Chinese; every `t('...')` string needs a matching
  entry in `src/i18n/en.json` (there is a test that checks this).
- Add or update tests in `tests/` for behavior changes. Fixtures must not
  contain real personal IPs — use well-known public resolver addresses
  (1.1.1.1, 8.8.8.8, 223.5.5.5, ...) or documentation ranges (192.0.2.x,
  2001:db8::) where public-IP validation is not exercised.
- Keep secrets out: API keys live in `.dev.vars` / Worker secrets, never in
  tracked files.

## License

By contributing you agree your work is released under the same
[AGPL-3.0](LICENSE) license as the project.
