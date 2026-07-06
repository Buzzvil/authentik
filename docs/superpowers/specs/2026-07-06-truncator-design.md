# Truncator — Design

**Package:** `@goauthentik/truncator`
**Date:** 2026-07-06
**Status:** Approved design, pre-implementation

## Purpose

Structure-aware string truncation for display in the authentik web UI (log and
event tables, columns of identifiers, etc.). Where a naive `slice(0, n) + "…"`
throws away the meaningful part of a value, truncator keeps the human-useful
pieces and ellipsizes the noise — a URL keeps its domain and readable path
segments, a hash keeps its head and tail, a user-agent collapses to
`Chrome 120 · Windows`.

This revives and generalizes an old URL-only truncator (preserved as
`lib/legacy.js`) into a family of per-type truncators.

## Scope

Nine per-type truncators, one per module, all consumed through explicit
functions (no auto-detection, no strategy registry):

`url`, `hash`, `uuid`, `mac-address`, `ip-address`, `email`, `user-agent`,
`string`, `number`.

Out of scope: auto-detecting the type of an arbitrary value; a plugin/registry
system; rich structured return values; testing the DOM/canvas measurement path.

## Consumers & constraints

- **Consumer:** the Lit/PatternFly web UI. Truncation is **pixel-aware** — it
  must be able to fit a real rendered width, not only a character count.
- **Must stay testable and SSR-safe:** the algorithms cannot depend on the DOM.
  This is resolved by the injectable measurer (below): the default measurer is
  pure character-count, and that is the only path we test.
- **Language:** checked-JS with JSDoc types and `emitDeclarationOnly`, same as
  the sibling `logger-js` package. No `.ts` source migration.

## Architecture

### The measurer

The single abstraction that makes the library both pixel-aware and testable.

```
Measurer = (text: string) => number
```

- `characterMeasurer(text) => text.length` — the default. Pure, deterministic,
  SSR-safe. `maxWidth` then means "maximum characters".
- `createCanvasMeasurer(canvas: CanvasLike, font: string) => Measurer` — for DOM
  callers. Returns a measurer backed by `ctx.measureText(text).width`.
  `CanvasLike = OffscreenCanvas | HTMLCanvasElement` (the same type already used
  in `web/src/elements/mermaid/theme.ts`). A shared `OffscreenCanvas` can be
  reused across calls. **Not unit-tested** — it is a thin wrapper over the
  platform `measureText`.

Because character-count is just the identity-cost measurer, one algorithm serves
both the char-count and pixel modes; there is no second code path.

### Common options

Every truncator (except `number` — see below) takes:

```
TruncateOptions = {
  maxWidth: number,        // budget, in measurer units
  measure?: Measurer,      // defaults to characterMeasurer
  ellipsis?: string,       // defaults to "…" (single glyph, narrower than "...")
}
```

### Shared primitives (`lib/internal/`, not exported)

1. **`endEllipsis(value, opts)`** — keep the head, drop the tail: `"keep head…"`.
   The universal fallback used by every type when even its minimal structured
   form will not fit.
2. **`middleEllipsis(value, opts, { headBias?, boundary? })`** — keep head + tail
   with the ellipsis in the middle, grown greedily under the measurer until the
   budget is reached. `headBias` weights how much of the budget goes to the head
   vs the tail. `boundary` optionally snaps the cut to a separator (octet, uuid
   segment) instead of mid-token. Powers hash/uuid/mac/ipv6.
3. **`reducePipeline(value, opts, reducers[])`** — the legacy pattern
   generalized: run structure-aware reducers in priority order, re-measuring
   after each, and stop the moment the value fits. Powers url/email/user-agent.

### Per-type contract

Every `truncate<Type>(value, opts)`:

- returns a **plain string**;
- returns the input **unchanged** when it already fits `maxWidth`;
- **never** returns a string wider than `maxWidth` (except the degenerate case
  where `ellipsis` alone exceeds `maxWidth`);
- falls back to `endEllipsis` when even the minimal structured form won't fit.

## Per-type strategies

| Module | Strategy |
|---|---|
| **hash** | `middleEllipsis`, head-biased (the prefix is what people paste/grep, cf. git short-SHA). Keeps head + tail hex. |
| **uuid** | `middleEllipsis` on segment boundaries — keep first + last group, drop the middle. |
| **mac-address** | `middleEllipsis` on octet boundaries, separator preserved; the leading OUI octet(s) are kept. |
| **ip-address** | IPv4: octet middle-ellipsis (rarely needed, ≤15 chars). IPv6: canonicalize / `::`-compress first (RFC 5952), then group middle-ellipsis keeping first + last group. |
| **email** | `reducePipeline`: shrink the local-part first (middle-ellipsis), keep `@` + domain; then shrink the domain by reusing url's domain logic. |
| **url** | Port the `legacy.js` pipeline, cleaned up and made measure-aware: strip protocol/www/port → ellipsize noisy query params → ellipsize noisy path segments → shrink the longest domain part → prioritize domain over subdomains/TLD → merge ellipses → hard cut. |
| **string** | Generic. Default `mode: "end"` (`endEllipsis`); `mode: "middle"` opt-in. The base building block. |
| **user-agent** | **Parse & summarize.** A small in-house heuristic matcher extracts browser + version and OS into a compact form (`Chrome 120 · Windows`), then `endEllipsis` if still over budget. No heavy dependency. |
| **number** | **Wrap `Intl.NumberFormat` compact notation** (`1234567 → "1.2M"`), locale-aware. |

### number — signature note

`number` is deliberately a different shape from its siblings. Compact formatting
is not width-driven truncation, so `truncateNumber` does **not** take
`measure`/`maxWidth`. It takes:

```
truncateNumber(value: number, opts?: {
  locale?: string,                 // defaults to runtime locale
  maximumFractionDigits?: number,  // precision of the compact form
}) => string
```

## Module layout

```
packages/truncator/
  index.js                 # re-exports the 9 type modules (existing shape, unchanged)
  lib/
    internal/
      measurer.js          # Measurer type, characterMeasurer, createCanvasMeasurer
      primitives.js        # endEllipsis, middleEllipsis, reducePipeline, shared opts type
    url.js
    hash.js
    uuid.js
    mac-address.js
    ip-address.js
    email.js
    user-agent.js
    string.js
    number.js
    legacy.js              # deleted once url.js is ported and at parity
  test/
    *.test.ts              # one file per module, node environment
  vitest.config.ts         # node environment, include ./test/**/*.test.ts
```

## Package hygiene

The package was cloned from `logger-js` and carries leftover cruft to fix:

- Rewrite `description` → "Structure-aware string truncation for display".
- Drop the `pino` / `pino-pretty` peer-deps and `peerDependenciesMeta`.
- Add `vitest` devDep and scripts: `"test": "vitest run"`, `"test:watch": "vitest"`.

The `exports` map, `emitDeclarationOnly` build, and checked-JS setup stay as-is.

## Testing

Truncator owns its own tests — web's vitest config is scoped to `web/test` and
will not pick them up. A local `vitest.config.ts` runs the Node environment with
no DOM.

- **Only the character-count measurer is exercised** — deterministic and
  reproducible. The canvas measurer is left untested by design.
- Conventions mirror `web/test/unit/AGENTS.md`: `describe(symbol)`, full-sentence
  `it("returns X when Y")`, arrange/act/assert, real inputs over mocks, one file
  per module.
- Each type module gets a table of representative inputs at a few `maxWidth`
  budgets, plus the three invariants asserted across the board:
  1. the result never exceeds `maxWidth`;
  2. an input that already fits is returned unchanged;
  3. an over-tight budget falls back to `endEllipsis`.

## Decisions on record

- **API shape:** explicit per-type functions only — no auto-detect, no registry.
- **Measurement:** injectable measurer; char-count default (tested), canvas
  measurer for DOM (untested).
- **Return value:** plain string; caller keeps the original for a title/tooltip.
- **Ellipsis:** single glyph `"…"` by default.
- **user-agent:** parse & summarize.
- **number:** wrap `Intl` compact notation; different signature from siblings.
