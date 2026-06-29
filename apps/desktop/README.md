# Hermes Client Desktop ☤

Native desktop shell for Hermes Client: a remote-only UI that talks to an existing Hermes gateway instead of installing or running a second local agent brain.

## What it does

- connects to a configured remote Hermes gateway
- keeps chat, settings, sessions, and profile switching in one native window
- uses the same remote backend as the bundled CLI/TUI client
- supports client-side updates from the `sbbu/hermes-client` package/fork

## Install

See the repo-level install docs for the current package and desktop install flow.

## Updating

The desktop update flow is scoped to Hermes Client. From a terminal:

```bash
hermes-client update
```

The legacy alias remains available:

```bash
hermes-client self-update
```

## Development

Install workspace deps from the repo root once, then run the dev server from this directory:

```bash
npm install
cd apps/desktop
npm run dev
```

Useful checks:

```bash
npm run typecheck
npm run lint
npm run test:desktop:platforms
npm run test:ui
```

## Notes

Hermes Client intentionally stays thin: no local model/provider setup, no local gateway spawn, and no mutation of a stock Hermes Agent checkout. The local worker is a separate bridge for approved local-machine tools.

## License

MIT — see the repository license.
