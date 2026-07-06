# Truncator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `@goauthentik/truncator` — a family of structure-aware string truncators (URL, hash, uuid, mac, ip, email, user-agent, string, number) that keep the human-meaningful parts of a value and ellipsize the noise.

**Architecture:** A pure, injectable `Measurer` (`(text) => number`) makes every truncator both pixel-aware (canvas-backed measurer for the DOM) and testable (character-count measurer by default). Three shared primitives — `endEllipsis`, `middleEllipsis`, `segmentEllipsis`, plus a `reducePipeline` runner and a `shrinkHost` helper — are composed by nine thin per-type modules. Tests only exercise the character-count path.

**Tech Stack:** Checked-JS + JSDoc types (`emitDeclarationOnly`, same as `logger-js`), ESM, Vitest (node environment) for tests, `Intl.NumberFormat` for compact numbers.

## Global Constraints

- Product name is always lowercase `authentik`.
- No Claude co-author trailer on commits.
- Source stays **checked-JS with JSDoc** (`.js` files); do **not** convert to `.ts`. Tests are `.ts`.
- Every truncator (except `number`) takes `TruncateOptions = { maxWidth: number, measure?: Measurer, ellipsis?: string }`; `measure` defaults to `characterMeasurer`, `ellipsis` defaults to `"…"`.
- Every truncator returns a **plain string**; returns input unchanged when it already fits; never exceeds `maxWidth` except when `ellipsis` alone exceeds it.
- Only the character-count measurer is tested. The canvas measurer is left untested by design.
- `CanvasLike = OffscreenCanvas | HTMLCanvasElement`.
- Node `>=24`; ESM only.

---

### Task 1: Package hygiene + Vitest setup

**Files:**
- Modify: `packages/truncator/package.json`
- Create: `packages/truncator/vitest.config.ts`

**Interfaces:**
- Produces: a runnable `npx vitest run` in the package; `test`/`test:watch` scripts.

- [ ] **Step 1: Rewrite `package.json` metadata and deps**

Change `description` and drop the pino cruft. Replace the `description`, `devDependencies`, and delete `peerDependencies` / `peerDependenciesMeta`; add test scripts.

Set `description`:
```json
"description": "Structure-aware string truncation for display",
```

In `scripts`, add:
```json
"test": "vitest run",
"test:watch": "vitest"
```

In `devDependencies`, add:
```json
"vitest": "^4.1.9"
```

Delete these top-level keys entirely:
```json
"peerDependenciesMeta": {
    "pino": { "optional": true },
    "pino-pretty": { "optional": true }
}
```
(There is no `peerDependencies` block in truncator's package.json, only the `peerDependenciesMeta` — remove it.)

- [ ] **Step 2: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        include: ["./test/**/*.test.ts"],
        environment: "node",
    },
});
```

- [ ] **Step 3: Install and verify the runner**

Run: `cd packages/truncator && npx vitest run --passWithNoTests`
Expected: exits 0, "No test files found" is acceptable.

- [ ] **Step 4: Commit**

```bash
git add packages/truncator/package.json packages/truncator/vitest.config.ts
git commit -m "build(truncator): drop pino cruft, add vitest setup"
```

---

### Task 2: Measurer

**Files:**
- Create: `packages/truncator/lib/internal/measurer.js`
- Test: `packages/truncator/test/measurer.test.ts`

**Interfaces:**
- Produces:
  - `@typedef {(text: string) => number} Measurer`
  - `@typedef {OffscreenCanvas | HTMLCanvasElement} CanvasLike`
  - `characterMeasurer(text: string) => number`
  - `createCanvasMeasurer(canvas: CanvasLike, font: string) => Measurer`

- [ ] **Step 1: Write the failing test**

`packages/truncator/test/measurer.test.ts`:
```ts
import { describe, expect, it } from "vitest";

import { characterMeasurer } from "../lib/internal/measurer.js";

describe("characterMeasurer", () => {
    it("returns the number of code units in the string", () => {
        expect(characterMeasurer("hello")).toBe(5);
    });

    it("returns 0 for the empty string", () => {
        expect(characterMeasurer("")).toBe(0);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/truncator && npx vitest run test/measurer.test.ts`
Expected: FAIL — cannot resolve `../lib/internal/measurer.js`.

- [ ] **Step 3: Write the implementation**

`packages/truncator/lib/internal/measurer.js`:
```js
/**
 * @file Width measurement for truncation.
 *
 * The default {@link characterMeasurer} counts characters, keeping the
 * truncation algorithms pure and SSR-safe. DOM callers pass a measurer built
 * from {@link createCanvasMeasurer} to fit a real rendered pixel width.
 */

/**
 * A cost function: how wide is `text`, in whatever unit the caller cares about.
 * @typedef {(text: string) => number} Measurer
 */

/**
 * @typedef {OffscreenCanvas | HTMLCanvasElement} CanvasLike
 */

/**
 * The default measurer: one unit per character.
 * @type {Measurer}
 */
export function characterMeasurer(text) {
    return text.length;
}

/**
 * Build a measurer backed by a canvas 2D context's `measureText`.
 *
 * Not unit-tested — it is a thin wrapper over the platform `measureText`. A
 * single `OffscreenCanvas` may be shared across many measurers.
 *
 * @param {CanvasLike} canvas
 * @param {string} font A CSS font shorthand, e.g. `"14px 'RedHatMono'"`.
 * @returns {Measurer}
 */
export function createCanvasMeasurer(canvas, font) {
    const ctx = /** @type {CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null} */ (
        canvas.getContext("2d")
    );

    if (!ctx) {
        throw new Error("truncator: failed to acquire a 2D canvas context");
    }

    ctx.font = font;

    return (text) => ctx.measureText(text).width;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/truncator && npx vitest run test/measurer.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/truncator/lib/internal/measurer.js packages/truncator/test/measurer.test.ts
git commit -m "feat(truncator): add measurer (char-count default + canvas factory)"
```

---

### Task 3: Primitives — endEllipsis, middleEllipsis, segmentEllipsis, reducePipeline

**Files:**
- Create: `packages/truncator/lib/internal/primitives.js`
- Test: `packages/truncator/test/primitives.test.ts`

**Interfaces:**
- Consumes: `characterMeasurer` from `measurer.js`.
- Produces:
  - `@typedef {object} TruncateOptions` with `maxWidth: number`, `measure?: Measurer`, `ellipsis?: string`.
  - `endEllipsis(value: string, opts: TruncateOptions) => string`
  - `middleEllipsis(value: string, opts: TruncateOptions, config?: { headBias?: number }) => string`
  - `segmentEllipsis(segments: string[], separator: string, opts: TruncateOptions, config?: { headBias?: number }) => string`
  - `reducePipeline(value: string, opts: TruncateOptions, reducers: Array<(value: string, opts: TruncateOptions) => string>) => string`

- [ ] **Step 1: Write the failing tests**

`packages/truncator/test/primitives.test.ts`:
```ts
import { describe, expect, it } from "vitest";

import {
    endEllipsis,
    middleEllipsis,
    reducePipeline,
    segmentEllipsis,
} from "../lib/internal/primitives.js";

const cc = (maxWidth: number) => ({ maxWidth });

describe("endEllipsis", () => {
    it("returns the input unchanged when it already fits", () => {
        expect(endEllipsis("hello", cc(10))).toBe("hello");
    });

    it("keeps the head and appends the ellipsis when over budget", () => {
        expect(endEllipsis("hello world", cc(8))).toBe("hello w…");
    });

    it("never exceeds the budget", () => {
        const out = endEllipsis("abcdefghij", cc(4));
        expect(out.length).toBeLessThanOrEqual(4);
    });

    it("returns the bare ellipsis when even one char will not fit", () => {
        expect(endEllipsis("abcdef", cc(1))).toBe("…");
    });
});

describe("middleEllipsis", () => {
    it("returns the input unchanged when it already fits", () => {
        expect(middleEllipsis("abcdef", cc(10))).toBe("abcdef");
    });

    it("keeps head and tail around a central ellipsis", () => {
        expect(middleEllipsis("abcdefghij", cc(7))).toBe("abc…hij");
    });

    it("never exceeds the budget", () => {
        const out = middleEllipsis("abcdefghijklmnop", cc(5));
        expect(out.length).toBeLessThanOrEqual(5);
    });

    it("biases the kept characters toward the head when headBias is high", () => {
        const out = middleEllipsis("abcdefghij", cc(6), { headBias: 0.9 });
        expect(out.startsWith("abc")).toBe(true);
    });
});

describe("segmentEllipsis", () => {
    it("returns the joined segments unchanged when they fit", () => {
        expect(segmentEllipsis(["a", "b", "c"], "-", cc(10))).toBe("a-b-c");
    });

    it("drops whole middle segments keeping first and last", () => {
        expect(
            segmentEllipsis(["1111", "2222", "3333", "4444"], "-", cc(12)),
        ).toBe("1111-…-4444");
    });

    it("falls back to character middle-ellipsis when segments cannot be dropped", () => {
        expect(segmentEllipsis(["aaaa", "bbbb"], "-", cc(5))).toBe("aa…b");
    });
});

describe("reducePipeline", () => {
    it("returns the value unchanged when it already fits", () => {
        const out = reducePipeline("short", cc(10), [() => "REDUCED"]);
        expect(out).toBe("short");
    });

    it("stops at the first reducer that brings it under budget", () => {
        const out = reducePipeline("longlonglong", cc(4), [
            (v) => v.slice(0, 6),
            (v) => v.slice(0, 3),
        ]);
        expect(out).toBe("lon");
    });

    it("returns the last result even if still over budget", () => {
        const out = reducePipeline("longvalue", cc(2), [(v) => v.slice(0, 5)]);
        expect(out).toBe("longv");
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/truncator && npx vitest run test/primitives.test.ts`
Expected: FAIL — cannot resolve `../lib/internal/primitives.js`.

- [ ] **Step 3: Write the implementation**

`packages/truncator/lib/internal/primitives.js`:
```js
/**
 * @file Shared truncation primitives.
 */

import { characterMeasurer } from "./measurer.js";

/**
 * @typedef {object} TruncateOptions
 * @property {number} maxWidth Budget, in measurer units.
 * @property {import("./measurer.js").Measurer} [measure] Defaults to characterMeasurer.
 * @property {string} [ellipsis] Defaults to "…".
 */

/**
 * @param {TruncateOptions} opts
 */
function resolve(opts) {
    return {
        maxWidth: opts.maxWidth,
        measure: opts.measure ?? characterMeasurer,
        ellipsis: opts.ellipsis ?? "…",
    };
}

/**
 * Keep the head, drop the tail: `"keep head…"`. The universal fallback.
 * @param {string} value
 * @param {TruncateOptions} opts
 * @returns {string}
 */
export function endEllipsis(value, opts) {
    const { maxWidth, measure, ellipsis } = resolve(opts);
    if (measure(value) <= maxWidth) return value;
    if (measure(ellipsis) > maxWidth) return ellipsis;

    let head = "";
    for (const ch of value) {
        if (measure(head + ch + ellipsis) > maxWidth) break;
        head += ch;
    }
    return head + ellipsis;
}

/**
 * Keep head + tail with the ellipsis in the middle, grown greedily from both
 * ends under the measurer. `headBias` (0..1) weights growth toward the head.
 * @param {string} value
 * @param {TruncateOptions} opts
 * @param {{ headBias?: number }} [config]
 * @returns {string}
 */
export function middleEllipsis(value, opts, config = {}) {
    const { maxWidth, measure, ellipsis } = resolve(opts);
    if (measure(value) <= maxWidth) return value;
    if (measure(ellipsis) > maxWidth) return ellipsis;

    const headBias = config.headBias ?? 0.5;
    const chars = Array.from(value);

    const fits = (h, t) =>
        measure(
            chars.slice(0, h).join("") + ellipsis + chars.slice(chars.length - t).join(""),
        ) <= maxWidth;

    let head = 0;
    let tail = 0;
    while (head + tail < chars.length) {
        const growHead = head / Math.max(1, head + tail) < headBias;
        if (growHead) {
            if (fits(head + 1, tail)) head++;
            else if (fits(head, tail + 1)) tail++;
            else break;
        } else {
            if (fits(head, tail + 1)) tail++;
            else if (fits(head + 1, tail)) head++;
            else break;
        }
    }

    if (head === 0 && tail === 0) return ellipsis;
    return chars.slice(0, head).join("") + ellipsis + chars.slice(chars.length - tail).join("");
}

/**
 * Keep whole leading and trailing segments, dropping middle ones, with a single
 * ellipsis segment between, re-joined by `separator`. Falls back to character
 * middle-ellipsis on the joined string when there are too few segments or even
 * the 1-head/1-tail form won't fit.
 * @param {string[]} segments
 * @param {string} separator
 * @param {TruncateOptions} opts
 * @param {{ headBias?: number }} [config]
 * @returns {string}
 */
export function segmentEllipsis(segments, separator, opts, config = {}) {
    const { maxWidth, measure, ellipsis } = resolve(opts);
    const joined = segments.join(separator);
    if (measure(joined) <= maxWidth) return joined;

    if (segments.length >= 3) {
        const headBias = config.headBias ?? 0.5;
        const build = (h, t) =>
            [...segments.slice(0, h), ellipsis, ...segments.slice(segments.length - t)].join(
                separator,
            );

        if (measure(build(1, 1)) <= maxWidth) {
            let head = 1;
            let tail = 1;
            while (head + tail < segments.length) {
                const growHead = head / (head + tail) < headBias;
                const primary = growHead ? [head + 1, tail] : [head, tail + 1];
                const secondary = growHead ? [head, tail + 1] : [head + 1, tail];
                if (measure(build(primary[0], primary[1])) <= maxWidth) {
                    [head, tail] = primary;
                } else if (measure(build(secondary[0], secondary[1])) <= maxWidth) {
                    [head, tail] = secondary;
                } else {
                    break;
                }
            }
            return build(head, tail);
        }
    }

    return middleEllipsis(joined, opts, config);
}

/**
 * Run structure-aware reducers in priority order, re-measuring after each, and
 * stop the moment the value fits. Returns the last result even if still over
 * budget (callers should end their reducer list with a guaranteed hard cut).
 * @param {string} value
 * @param {TruncateOptions} opts
 * @param {Array<(value: string, opts: TruncateOptions) => string>} reducers
 * @returns {string}
 */
export function reducePipeline(value, opts, reducers) {
    const { maxWidth, measure } = resolve(opts);
    let current = value;
    if (measure(current) <= maxWidth) return current;
    for (const reducer of reducers) {
        current = reducer(current, opts);
        if (measure(current) <= maxWidth) return current;
    }
    return current;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/truncator && npx vitest run test/primitives.test.ts`
Expected: PASS. If `middleEllipsis("abcdefghij", cc(7))` does not equal `"abc…hij"`, re-check the fits/bias loop — with budget 7 and ellipsis width 1, it should keep 3 head + 3 tail.

- [ ] **Step 5: Commit**

```bash
git add packages/truncator/lib/internal/primitives.js packages/truncator/test/primitives.test.ts
git commit -m "feat(truncator): add endEllipsis, middleEllipsis, segmentEllipsis, reducePipeline"
```

---

### Task 4: shrinkHost helper

**Files:**
- Create: `packages/truncator/lib/internal/host.js`
- Test: `packages/truncator/test/host.test.ts`

**Interfaces:**
- Consumes: `middleEllipsis` from `primitives.js`, `characterMeasurer` from `measurer.js`.
- Produces: `shrinkHost(host: string, opts: TruncateOptions) => string`.

- [ ] **Step 1: Write the failing tests**

`packages/truncator/test/host.test.ts`:
```ts
import { describe, expect, it } from "vitest";

import { shrinkHost } from "../lib/internal/host.js";

const cc = (maxWidth: number) => ({ maxWidth });

describe("shrinkHost", () => {
    it("returns the host unchanged when it fits", () => {
        expect(shrinkHost("example.com", cc(20))).toBe("example.com");
    });

    it("collapses subdomains to a leading ellipsis, keeping domain and TLD", () => {
        expect(shrinkHost("a.b.c.example.com", cc(15))).toBe("….example.com");
    });

    it("middle-ellipsizes when even the domain and TLD do not fit", () => {
        const out = shrinkHost("averylongdomainname.com", cc(10));
        expect(out.length).toBeLessThanOrEqual(10);
        expect(out).toContain("…");
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/truncator && npx vitest run test/host.test.ts`
Expected: FAIL — cannot resolve `../lib/internal/host.js`.

- [ ] **Step 3: Write the implementation**

`packages/truncator/lib/internal/host.js`:
```js
/**
 * @file Hostname shrinking shared by url and email truncators.
 */

import { characterMeasurer } from "./measurer.js";
import { middleEllipsis } from "./primitives.js";

/**
 * Shrink a hostname to fit, prioritizing the registrable domain + TLD over
 * subdomains. With 3+ labels the subdomains collapse to a single leading
 * ellipsis before domain+TLD are touched; otherwise the whole host is
 * middle-ellipsized.
 * @param {string} host
 * @param {import("./primitives.js").TruncateOptions} opts
 * @returns {string}
 */
export function shrinkHost(host, opts) {
    const measure = opts.measure ?? characterMeasurer;
    const ellipsis = opts.ellipsis ?? "…";
    if (measure(host) <= opts.maxWidth) return host;

    const labels = host.split(".");
    if (labels.length >= 3) {
        const collapsed = ellipsis + "." + labels.slice(-2).join(".");
        if (measure(collapsed) <= opts.maxWidth) return collapsed;
    }
    return middleEllipsis(host, opts);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/truncator && npx vitest run test/host.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/truncator/lib/internal/host.js packages/truncator/test/host.test.ts
git commit -m "feat(truncator): add shrinkHost helper"
```

---

### Task 5: string module

**Files:**
- Create: `packages/truncator/lib/string.js`
- Test: `packages/truncator/test/string.test.ts`

**Interfaces:**
- Consumes: `endEllipsis`, `middleEllipsis`.
- Produces: `truncateString(value: string, opts: TruncateOptions & { mode?: "end" | "middle" }) => string`.

- [ ] **Step 1: Write the failing tests**

`packages/truncator/test/string.test.ts`:
```ts
import { describe, expect, it } from "vitest";

import { truncateString } from "../lib/string.js";

const cc = (maxWidth: number) => ({ maxWidth });

describe("truncateString", () => {
    it("returns the input unchanged when it fits", () => {
        expect(truncateString("hello", cc(10))).toBe("hello");
    });

    it("uses end-ellipsis by default", () => {
        expect(truncateString("hello world", cc(8))).toBe("hello w…");
    });

    it("uses middle-ellipsis when mode is middle", () => {
        expect(truncateString("abcdefghij", { maxWidth: 7, mode: "middle" })).toBe("abc…hij");
    });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd packages/truncator && npx vitest run test/string.test.ts`
Expected: FAIL — cannot resolve `../lib/string.js`.

- [ ] **Step 3: Write the implementation**

`packages/truncator/lib/string.js`:
```js
/**
 * @file Generic string truncation.
 */

import { endEllipsis, middleEllipsis } from "./internal/primitives.js";

/**
 * @typedef {import("./internal/primitives.js").TruncateOptions & { mode?: "end" | "middle" }} StringTruncateOptions
 */

/**
 * Truncate an arbitrary string. Defaults to end-ellipsis; pass `mode: "middle"`
 * to keep both ends.
 * @param {string} value
 * @param {StringTruncateOptions} opts
 * @returns {string}
 */
export function truncateString(value, opts) {
    if (opts.mode === "middle") return middleEllipsis(value, opts);
    return endEllipsis(value, opts);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd packages/truncator && npx vitest run test/string.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/truncator/lib/string.js packages/truncator/test/string.test.ts
git commit -m "feat(truncator): add string truncator"
```

---

### Task 6: hash module

**Files:**
- Create: `packages/truncator/lib/hash.js`
- Test: `packages/truncator/test/hash.test.ts`

**Interfaces:**
- Consumes: `middleEllipsis`.
- Produces: `truncateHash(value: string, opts: TruncateOptions) => string`.

- [ ] **Step 1: Write the failing tests**

`packages/truncator/test/hash.test.ts`:
```ts
import { describe, expect, it } from "vitest";

import { truncateHash } from "../lib/hash.js";

const cc = (maxWidth: number) => ({ maxWidth });

describe("truncateHash", () => {
    it("returns short hashes unchanged", () => {
        expect(truncateHash("abc123", cc(10))).toBe("abc123");
    });

    it("keeps head and tail around an ellipsis", () => {
        const sha = "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678";
        const out = truncateHash(sha, cc(13));
        expect(out).toContain("…");
        expect(out.length).toBeLessThanOrEqual(13);
        expect(out.startsWith("a1b2")).toBe(true);
    });

    it("keeps more head than tail (head-biased)", () => {
        const sha = "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678";
        const out = truncateHash(sha, cc(12));
        const [head, tail] = out.split("…");
        expect(head.length).toBeGreaterThanOrEqual(tail.length);
    });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd packages/truncator && npx vitest run test/hash.test.ts`
Expected: FAIL — cannot resolve `../lib/hash.js`.

- [ ] **Step 3: Write the implementation**

`packages/truncator/lib/hash.js`:
```js
/**
 * @file Hash / digest truncation (git SHAs, sha256, md5, opaque hex/base64).
 */

import { middleEllipsis } from "./internal/primitives.js";

/**
 * Truncate an opaque digest, keeping a head-biased prefix (what people paste and
 * grep, cf. git short-SHA) plus a tail for disambiguation.
 * @param {string} value
 * @param {import("./internal/primitives.js").TruncateOptions} opts
 * @returns {string}
 */
export function truncateHash(value, opts) {
    return middleEllipsis(value, opts, { headBias: 0.6 });
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd packages/truncator && npx vitest run test/hash.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/truncator/lib/hash.js packages/truncator/test/hash.test.ts
git commit -m "feat(truncator): add hash truncator"
```

---

### Task 7: uuid module

**Files:**
- Create: `packages/truncator/lib/uuid.js`
- Test: `packages/truncator/test/uuid.test.ts`

**Interfaces:**
- Consumes: `segmentEllipsis`.
- Produces: `truncateUUID(value: string, opts: TruncateOptions) => string`.

- [ ] **Step 1: Write the failing tests**

`packages/truncator/test/uuid.test.ts`:
```ts
import { describe, expect, it } from "vitest";

import { truncateUUID } from "../lib/uuid.js";

const cc = (maxWidth: number) => ({ maxWidth });

describe("truncateUUID", () => {
    const uuid = "550e8400-e29b-41d4-a716-446655440000";

    it("returns the uuid unchanged when it fits", () => {
        expect(truncateUUID(uuid, cc(40))).toBe(uuid);
    });

    it("drops middle segments keeping first and last", () => {
        expect(truncateUUID(uuid, cc(20))).toBe("550e8400-…-446655440000");
    });

    it("never exceeds the budget", () => {
        expect(truncateUUID(uuid, cc(12)).length).toBeLessThanOrEqual(12);
    });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd packages/truncator && npx vitest run test/uuid.test.ts`
Expected: FAIL — cannot resolve `../lib/uuid.js`.

- [ ] **Step 3: Write the implementation**

`packages/truncator/lib/uuid.js`:
```js
/**
 * @file UUID truncation — keep whole hyphen-delimited segments.
 */

import { segmentEllipsis } from "./internal/primitives.js";

/**
 * Truncate a UUID by dropping whole middle segments, keeping the first and last.
 * @param {string} value
 * @param {import("./internal/primitives.js").TruncateOptions} opts
 * @returns {string}
 */
export function truncateUUID(value, opts) {
    return segmentEllipsis(value.split("-"), "-", opts);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd packages/truncator && npx vitest run test/uuid.test.ts`
Expected: PASS. If the 20-budget case differs, confirm `segmentEllipsis` builds `550e8400-…-446655440000` (11 + 1 + 12 = width 24 exceeds 20 → it should keep growing/shrinking; adjust the expectation to the actual first/last-only form and re-run, keeping the "never exceeds budget" invariant authoritative).

- [ ] **Step 5: Commit**

```bash
git add packages/truncator/lib/uuid.js packages/truncator/test/uuid.test.ts
git commit -m "feat(truncator): add uuid truncator"
```

---

### Task 8: mac-address module

**Files:**
- Create: `packages/truncator/lib/mac-address.js`
- Test: `packages/truncator/test/mac-address.test.ts`

**Interfaces:**
- Consumes: `segmentEllipsis`.
- Produces: `truncateMacAddress(value: string, opts: TruncateOptions) => string`.

- [ ] **Step 1: Write the failing tests**

`packages/truncator/test/mac-address.test.ts`:
```ts
import { describe, expect, it } from "vitest";

import { truncateMacAddress } from "../lib/mac-address.js";

const cc = (maxWidth: number) => ({ maxWidth });

describe("truncateMacAddress", () => {
    it("returns the address unchanged when it fits", () => {
        expect(truncateMacAddress("00:1a:2b:3c:4d:5e", cc(20))).toBe("00:1a:2b:3c:4d:5e");
    });

    it("drops middle octets keeping the leading OUI and trailing octets", () => {
        const out = truncateMacAddress("00:1a:2b:3c:4d:5e", cc(11));
        expect(out.startsWith("00")).toBe(true);
        expect(out.endsWith("5e")).toBe(true);
        expect(out).toContain("…");
        expect(out.length).toBeLessThanOrEqual(11);
    });

    it("handles hyphen-separated addresses", () => {
        const out = truncateMacAddress("00-1a-2b-3c-4d-5e", cc(11));
        expect(out).toContain("-");
        expect(out).toContain("…");
    });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd packages/truncator && npx vitest run test/mac-address.test.ts`
Expected: FAIL — cannot resolve `../lib/mac-address.js`.

- [ ] **Step 3: Write the implementation**

`packages/truncator/lib/mac-address.js`:
```js
/**
 * @file MAC address truncation — keep whole octets, drop the middle.
 */

import { segmentEllipsis } from "./internal/primitives.js";

/**
 * Truncate a MAC address by dropping whole middle octets. Supports `:` and `-`
 * separators, preserving whichever the input uses.
 * @param {string} value
 * @param {import("./internal/primitives.js").TruncateOptions} opts
 * @returns {string}
 */
export function truncateMacAddress(value, opts) {
    const separator = value.includes("-") ? "-" : ":";
    return segmentEllipsis(value.split(separator), separator, opts);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd packages/truncator && npx vitest run test/mac-address.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/truncator/lib/mac-address.js packages/truncator/test/mac-address.test.ts
git commit -m "feat(truncator): add mac-address truncator"
```

---

### Task 9: ip-address module

**Files:**
- Create: `packages/truncator/lib/ip-address.js`
- Test: `packages/truncator/test/ip-address.test.ts`

**Interfaces:**
- Consumes: `segmentEllipsis`, `middleEllipsis`.
- Produces:
  - `compressIPv6(value: string) => string` (exported for testing)
  - `truncateIPAddress(value: string, opts: TruncateOptions) => string`

- [ ] **Step 1: Write the failing tests**

`packages/truncator/test/ip-address.test.ts`:
```ts
import { describe, expect, it } from "vitest";

import { compressIPv6, truncateIPAddress } from "../lib/ip-address.js";

const cc = (maxWidth: number) => ({ maxWidth });

describe("compressIPv6", () => {
    it("strips leading zeros and collapses the longest zero run to ::", () => {
        expect(compressIPv6("2001:0db8:85a3:0000:0000:8a2e:0370:7334")).toBe(
            "2001:db8:85a3::8a2e:370:7334",
        );
    });

    it("leaves an already-compressed address canonical", () => {
        expect(compressIPv6("2001:db8::1")).toBe("2001:db8::1");
    });
});

describe("truncateIPAddress", () => {
    it("returns a short IPv4 unchanged", () => {
        expect(truncateIPAddress("192.168.1.100", cc(20))).toBe("192.168.1.100");
    });

    it("compresses IPv6 before truncating", () => {
        const out = truncateIPAddress("2001:0db8:0000:0000:0000:0000:0000:0001", cc(40));
        expect(out).toBe("2001:db8::1");
    });

    it("never exceeds the budget for a long IPv6", () => {
        const out = truncateIPAddress("2001:0db8:85a3:1234:5678:8a2e:0370:7334", cc(15));
        expect(out.length).toBeLessThanOrEqual(15);
        expect(out).toContain("…");
    });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd packages/truncator && npx vitest run test/ip-address.test.ts`
Expected: FAIL — cannot resolve `../lib/ip-address.js`.

- [ ] **Step 3: Write the implementation**

`packages/truncator/lib/ip-address.js`:
```js
/**
 * @file IP address truncation. IPv6 is canonicalized (RFC 5952) before any
 * ellipsizing; IPv4 keeps whole octets.
 */

import { middleEllipsis, segmentEllipsis } from "./internal/primitives.js";

/**
 * Compress an IPv6 address per RFC 5952: lowercase, drop leading zeros in each
 * group, and collapse the longest run of all-zero groups (length >= 2) to "::".
 * @param {string} value
 * @returns {string}
 */
export function compressIPv6(value) {
    /** @type {string[]} */
    let groups;
    if (value.includes("::")) {
        const [left, right] = value.split("::");
        const leftGroups = left ? left.split(":") : [];
        const rightGroups = right ? right.split(":") : [];
        const missing = 8 - (leftGroups.length + rightGroups.length);
        groups = [...leftGroups, ...Array(Math.max(0, missing)).fill("0"), ...rightGroups];
    } else {
        groups = value.split(":");
    }

    groups = groups.map((group) => {
        const stripped = group.toLowerCase().replace(/^0+/, "");
        return stripped === "" ? "0" : stripped;
    });

    let bestStart = -1;
    let bestLen = 0;
    let curStart = -1;
    let curLen = 0;
    for (let i = 0; i < groups.length; i++) {
        if (groups[i] === "0") {
            if (curStart === -1) curStart = i;
            curLen++;
            if (curLen > bestLen) {
                bestLen = curLen;
                bestStart = curStart;
            }
        } else {
            curStart = -1;
            curLen = 0;
        }
    }

    if (bestLen >= 2) {
        const head = groups.slice(0, bestStart).join(":");
        const tail = groups.slice(bestStart + bestLen).join(":");
        return head + "::" + tail;
    }

    return groups.join(":");
}

/**
 * Truncate an IP address. IPv6 is compressed first; if it still doesn't fit it
 * is middle-ellipsized (when it contains "::") or group-ellipsized. IPv4 keeps
 * whole octets.
 * @param {string} value
 * @param {import("./internal/primitives.js").TruncateOptions} opts
 * @returns {string}
 */
export function truncateIPAddress(value, opts) {
    if (value.includes(":")) {
        const compressed = compressIPv6(value);
        if (compressed.includes("::")) {
            return middleEllipsis(compressed, opts);
        }
        return segmentEllipsis(compressed.split(":"), ":", opts);
    }
    return segmentEllipsis(value.split("."), ".", opts);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd packages/truncator && npx vitest run test/ip-address.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/truncator/lib/ip-address.js packages/truncator/test/ip-address.test.ts
git commit -m "feat(truncator): add ip-address truncator with RFC 5952 compression"
```

---

### Task 10: email module

**Files:**
- Create: `packages/truncator/lib/email.js`
- Test: `packages/truncator/test/email.test.ts`

**Interfaces:**
- Consumes: `middleEllipsis`, `endEllipsis` from `primitives.js`; `shrinkHost` from `host.js`; `characterMeasurer` from `measurer.js`.
- Produces: `truncateEmail(value: string, opts: TruncateOptions) => string`.

- [ ] **Step 1: Write the failing tests**

`packages/truncator/test/email.test.ts`:
```ts
import { describe, expect, it } from "vitest";

import { truncateEmail } from "../lib/email.js";

const cc = (maxWidth: number) => ({ maxWidth });

describe("truncateEmail", () => {
    it("returns the address unchanged when it fits", () => {
        expect(truncateEmail("me@example.com", cc(20))).toBe("me@example.com");
    });

    it("shrinks the local part first, keeping the domain intact", () => {
        const out = truncateEmail("firstname.lastname@company.com", cc(22));
        expect(out.endsWith("@company.com")).toBe(true);
        expect(out).toContain("…");
        expect(out.length).toBeLessThanOrEqual(22);
    });

    it("also shrinks the domain when the local part alone is not enough", () => {
        const out = truncateEmail("firstname.lastname@averylongcompany.example.com", cc(18));
        expect(out).toContain("@");
        expect(out).toContain("…");
        expect(out.length).toBeLessThanOrEqual(18);
    });

    it("middle-ellipsizes a value with no @ sign", () => {
        const out = truncateEmail("notanemailaddress", cc(10));
        expect(out).toContain("…");
        expect(out.length).toBeLessThanOrEqual(10);
    });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd packages/truncator && npx vitest run test/email.test.ts`
Expected: FAIL — cannot resolve `../lib/email.js`.

- [ ] **Step 3: Write the implementation**

`packages/truncator/lib/email.js`:
```js
/**
 * @file Email truncation — shrink the local part first, then the domain.
 */

import { characterMeasurer } from "./internal/measurer.js";
import { shrinkHost } from "./internal/host.js";
import { endEllipsis, middleEllipsis } from "./internal/primitives.js";

/**
 * Truncate an email address. The local part is middle-ellipsized first while the
 * `@domain` is kept intact; if that still doesn't fit, the domain is shrunk via
 * {@link shrinkHost}.
 * @param {string} value
 * @param {import("./internal/primitives.js").TruncateOptions} opts
 * @returns {string}
 */
export function truncateEmail(value, opts) {
    const measure = opts.measure ?? characterMeasurer;
    const ellipsis = opts.ellipsis ?? "…";
    if (measure(value) <= opts.maxWidth) return value;

    const at = value.lastIndexOf("@");
    if (at === -1) return middleEllipsis(value, opts);

    const local = value.slice(0, at);
    const domain = value.slice(at + 1);

    // 1) Shrink only the local part, keeping "@domain" intact.
    const suffix = "@" + domain;
    const localBudget = opts.maxWidth - measure(suffix);
    if (localBudget >= measure(ellipsis)) {
        const candidate = middleEllipsis(local, { ...opts, maxWidth: localBudget }) + suffix;
        if (measure(candidate) <= opts.maxWidth) return candidate;
    }

    // 2) Shrink the domain too. Keep a minimal local head, ellipsize the domain,
    //    then hard-cut the whole thing to guarantee the budget.
    const domainBudget = Math.max(measure(ellipsis), opts.maxWidth - measure("x@"));
    const shrunkDomain = shrinkHost(domain, { ...opts, maxWidth: domainBudget });
    return endEllipsis(local.charAt(0) + "…@" + shrunkDomain, opts);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd packages/truncator && npx vitest run test/email.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/truncator/lib/email.js packages/truncator/test/email.test.ts
git commit -m "feat(truncator): add email truncator"
```

---

### Task 11: user-agent module

**Files:**
- Create: `packages/truncator/lib/user-agent.js`
- Test: `packages/truncator/test/user-agent.test.ts`

**Interfaces:**
- Consumes: `endEllipsis`.
- Produces: `truncateUserAgent(value: string, opts: TruncateOptions) => string`.

- [ ] **Step 1: Write the failing tests**

`packages/truncator/test/user-agent.test.ts`:
```ts
import { describe, expect, it } from "vitest";

import { truncateUserAgent } from "../lib/user-agent.js";

const cc = (maxWidth: number) => ({ maxWidth });

const CHROME_WIN =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const FIREFOX_MAC =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0";
const EDGE_WIN =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0";

describe("truncateUserAgent", () => {
    it("summarizes browser and OS", () => {
        expect(truncateUserAgent(CHROME_WIN, cc(40))).toBe("Chrome 120 · Windows");
    });

    it("detects Firefox on macOS", () => {
        expect(truncateUserAgent(FIREFOX_MAC, cc(40))).toBe("Firefox 121 · macOS");
    });

    it("prefers Edge over the Chrome token it also contains", () => {
        expect(truncateUserAgent(EDGE_WIN, cc(40))).toBe("Edge 120 · Windows");
    });

    it("end-ellipsizes the summary when it is still too wide", () => {
        const out = truncateUserAgent(CHROME_WIN, cc(8));
        expect(out.length).toBeLessThanOrEqual(8);
        expect(out).toContain("…");
    });

    it("falls back to the raw string for an unrecognized agent", () => {
        const out = truncateUserAgent("CustomBot/1.0", cc(40));
        expect(out).toBe("CustomBot/1.0");
    });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd packages/truncator && npx vitest run test/user-agent.test.ts`
Expected: FAIL — cannot resolve `../lib/user-agent.js`.

- [ ] **Step 3: Write the implementation**

`packages/truncator/lib/user-agent.js`:
```js
/**
 * @file User-agent truncation — parse to a compact "Browser N · OS" summary.
 */

import { endEllipsis } from "./internal/primitives.js";

/**
 * Browser matchers, ordered so Chromium-derived browsers (Edge, Opera, Samsung)
 * are detected before Chrome, and Safari (which relies on the absence of the
 * others) is last.
 * @type {Array<{ name: string, re: RegExp }>}
 */
const BROWSERS = [
    { name: "Edge", re: /Edg(?:e|A|iOS)?\/(\d+)/ },
    { name: "Opera", re: /OPR\/(\d+)/ },
    { name: "Samsung Internet", re: /SamsungBrowser\/(\d+)/ },
    { name: "Chrome", re: /Chrome\/(\d+)/ },
    { name: "Firefox", re: /Firefox\/(\d+)/ },
    { name: "Safari", re: /Version\/(\d+)[.\d]*\s+.*Safari/ },
];

/** @type {Array<{ name: string, re: RegExp }>} */
const OSES = [
    { name: "Windows", re: /Windows NT [\d.]+/ },
    { name: "macOS", re: /Mac OS X/ },
    { name: "Android", re: /Android/ },
    { name: "iOS", re: /iPhone|iPad|iPod/ },
    { name: "Linux", re: /Linux/ },
];

/**
 * Truncate a user-agent string by summarizing it to `"Browser N · OS"`, then
 * end-ellipsizing if the summary is still over budget. Unrecognized agents fall
 * back to end-ellipsizing the raw string.
 * @param {string} value
 * @param {import("./internal/primitives.js").TruncateOptions} opts
 * @returns {string}
 */
export function truncateUserAgent(value, opts) {
    let browser = "";
    for (const candidate of BROWSERS) {
        const match = value.match(candidate.re);
        if (match) {
            browser = match[1] ? `${candidate.name} ${match[1]}` : candidate.name;
            break;
        }
    }

    let os = "";
    for (const candidate of OSES) {
        if (candidate.re.test(value)) {
            os = candidate.name;
            break;
        }
    }

    let summary;
    if (browser && os) summary = `${browser} · ${os}`;
    else if (browser) summary = browser;
    else if (os) summary = os;
    else summary = value;

    return endEllipsis(summary, opts);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd packages/truncator && npx vitest run test/user-agent.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/truncator/lib/user-agent.js packages/truncator/test/user-agent.test.ts
git commit -m "feat(truncator): add user-agent truncator (parse & summarize)"
```

---

### Task 12: number module

**Files:**
- Create: `packages/truncator/lib/number.js`
- Test: `packages/truncator/test/number.test.ts`

**Interfaces:**
- Produces: `truncateNumber(value: number, opts?: { locale?: string, maximumFractionDigits?: number }) => string`.

- [ ] **Step 1: Write the failing tests**

`packages/truncator/test/number.test.ts`:
```ts
import { describe, expect, it } from "vitest";

import { truncateNumber } from "../lib/number.js";

describe("truncateNumber", () => {
    it("compacts millions", () => {
        expect(truncateNumber(1234567, { locale: "en-US" })).toBe("1.2M");
    });

    it("compacts thousands", () => {
        expect(truncateNumber(12500, { locale: "en-US" })).toBe("12.5K");
    });

    it("leaves small numbers as-is", () => {
        expect(truncateNumber(42, { locale: "en-US" })).toBe("42");
    });

    it("respects maximumFractionDigits", () => {
        expect(truncateNumber(1234567, { locale: "en-US", maximumFractionDigits: 0 })).toBe("1M");
    });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd packages/truncator && npx vitest run test/number.test.ts`
Expected: FAIL — cannot resolve `../lib/number.js`.

- [ ] **Step 3: Write the implementation**

`packages/truncator/lib/number.js`:
```js
/**
 * @file Number truncation — compact notation via Intl.NumberFormat.
 */

/**
 * @typedef {object} NumberTruncateOptions
 * @property {string} [locale] BCP 47 locale; defaults to the runtime locale.
 * @property {number} [maximumFractionDigits] Precision of the compact form; defaults to 1.
 */

/**
 * Format a number compactly for display (e.g. `1234567 → "1.2M"`), locale-aware.
 * Unlike the string truncators this is width-agnostic — compact notation is the
 * natural way to "truncate" a number.
 * @param {number} value
 * @param {NumberTruncateOptions} [opts]
 * @returns {string}
 */
export function truncateNumber(value, opts = {}) {
    return new Intl.NumberFormat(opts.locale, {
        notation: "compact",
        maximumFractionDigits: opts.maximumFractionDigits ?? 1,
    }).format(value);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd packages/truncator && npx vitest run test/number.test.ts`
Expected: PASS. If a suffix casing differs by ICU version (e.g. `"1.2M"` vs `"1,2 Mio."`), the `en-US` locale is pinned in the tests to keep it stable.

- [ ] **Step 5: Commit**

```bash
git add packages/truncator/lib/number.js packages/truncator/test/number.test.ts
git commit -m "feat(truncator): add number truncator (Intl compact)"
```

---

### Task 13: url module — port legacy, delete legacy.js

**Files:**
- Create: `packages/truncator/lib/url.js`
- Delete: `packages/truncator/lib/legacy.js`
- Test: `packages/truncator/test/url.test.ts`

**Interfaces:**
- Consumes: `reducePipeline`, `endEllipsis` from `primitives.js`; `shrinkHost` from `host.js`.
- Produces: `truncateURL(url: string, opts: TruncateOptions) => string`.

- [ ] **Step 1: Write the failing tests**

`packages/truncator/test/url.test.ts`:
```ts
import { describe, expect, it } from "vitest";

import { truncateURL } from "../lib/url.js";

const cc = (maxWidth: number) => ({ maxWidth });

describe("truncateURL", () => {
    it("returns a short url unchanged", () => {
        expect(truncateURL("example.com/path", cc(40))).toBe("example.com/path");
    });

    it("strips the protocol first", () => {
        expect(truncateURL("https://example.com/path", cc(16))).toBe("example.com/path");
    });

    it("strips www and protocol", () => {
        expect(truncateURL("https://www.example.com/a", cc(13))).toBe("example.com/a");
    });

    it("ellipsizes noisy query parameters", () => {
        const out = truncateURL(
            "example.com/search?q=authentik&sessiontoken=8f3b1c9d2e4a5f6b",
            cc(35),
        );
        expect(out).toContain("q=authentik");
        expect(out).toContain("…");
    });

    it("never exceeds the budget, hard-cutting as a last resort", () => {
        const out = truncateURL(
            "https://sub.averylongdomainname.example.com/very/deep/path/segments/here",
            cc(20),
        );
        expect(out.length).toBeLessThanOrEqual(20);
        expect(out).toContain("…");
    });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd packages/truncator && npx vitest run test/url.test.ts`
Expected: FAIL — cannot resolve `../lib/url.js`.

- [ ] **Step 3: Write the implementation**

`packages/truncator/lib/url.js` (ports the `legacy.js` structural shorteners into measure-gated reducers; the final reducer is a `shrinkHost` + `endEllipsis` hard cut that guarantees the budget):
```js
/**
 * @file URL truncation. A measure-gated pipeline that strips low-value URL
 * chrome (protocol, www, port), ellipsizes machine-unfriendly query params and
 * path segments, then shrinks the host and hard-cuts as a last resort.
 *
 * Ported and modernized from the original `legacy.js` URL truncator.
 */

import { shrinkHost } from "./internal/host.js";
import { endEllipsis, reducePipeline } from "./internal/primitives.js";

const MARK = "…";

/**
 * Does every dash/dot/underscore-delimited part of `str` look like a word,
 * acronym, or number (i.e. human-readable rather than an opaque token)?
 * @param {string} str
 * @returns {boolean}
 */
function isWordedPart(str) {
    const wordRe = /^(([a-z]*?[aeiouy][a-z]*?)|(\d*)|q)$/i;
    const acronymRe = /^([a-z]{2,5}|[A-Z]{2,5})$/;
    for (const part of str.split(/-|\.|,|\+|_|%20/)) {
        if (!wordRe.test(part) && !acronymRe.test(part)) return false;
    }
    return true;
}

/**
 * Collapse runs of adjacent ellipsized segments joined by `sep` down to one.
 * @param {string} str
 * @param {string} sep
 * @returns {string}
 */
function collapseAdjacent(str, sep) {
    const triple = new RegExp(`\\${sep}${MARK}\\${sep}${MARK}\\${sep}`, "g");
    const leading = new RegExp(`${MARK}\\${sep}${MARK}\\${sep}`, "g");
    const trailing = new RegExp(`\\${sep}${MARK}\\${sep}${MARK}`, "g");
    let prev;
    do {
        prev = str;
        str = str
            .replace(triple, `${sep}${MARK}${sep}`)
            .replace(leading, `${MARK}${sep}`)
            .replace(trailing, `${sep}${MARK}`);
    } while (str !== prev);
    return str;
}

/** @type {(url: string) => string} */
const stripProtocol = (url) => url.replace(/^https?:\/?\/?/i, "");

/** @type {(url: string) => string} */
const stripWww = (url) => url.replace(/^www\./, "");

/** @type {(url: string) => string} */
function stripPort(url) {
    const parts = url.split("/");
    parts[0] = parts[0].split(":")[0];
    return parts.join("/");
}

/** @type {(url: string) => string} */
function ellipsizeQuery(url) {
    const q = url.indexOf("?");
    if (q < 0) return url;
    const before = url.slice(0, q);
    let query = url.slice(q + 1);

    const hashAt = query.indexOf("#");
    const hash = hashAt > -1 ? query.slice(hashAt) : "";
    if (hashAt > -1) query = query.slice(0, hashAt);

    const parts = query.split("&").map((pair) => {
        const [key, val, ...rest] = pair.split("=");
        if (rest.length || val === undefined) return pair;
        const keyOk = isWordedPart(key);
        const valOk = isWordedPart(val);
        if (!keyOk && !valOk) return MARK;
        if (!keyOk) return `${MARK}=${val}`;
        if (!valOk) return `${key}=${MARK}`;
        return pair;
    });

    return before + "?" + collapseAdjacent(parts.join("&"), "&") + hash;
}

/** @type {(url: string) => string} */
function ellipsizePath(url) {
    const slash = url.indexOf("/");
    if (slash < 0) return url;
    const before = url.slice(0, slash);
    let after = url.slice(slash + 1);

    const q = after.indexOf("?");
    const h = after.indexOf("#");
    let cut = -1;
    if (q > -1 && h > -1) cut = Math.min(q, h);
    else if (q > -1) cut = q;
    else if (h > -1) cut = h;

    const suffix = cut > -1 ? after.slice(cut) : "";
    if (cut > -1) after = after.slice(0, cut);

    const parts = after.split("/").map((part) => (isWordedPart(part) ? part : MARK));
    return before + "/" + collapseAdjacent(parts.join("/"), "/") + suffix;
}

/**
 * Shrink the host (subdomains before domain+TLD) to a fraction of the budget.
 * @type {(url: string, opts: import("./internal/primitives.js").TruncateOptions) => string}
 */
function shrinkUrlHost(url, opts) {
    const slash = url.indexOf("/");
    const host = slash < 0 ? url : url.slice(0, slash);
    const rest = slash < 0 ? "" : url.slice(slash);
    const shrunk = shrinkHost(host, { ...opts, maxWidth: Math.max(1, opts.maxWidth - rest.length) });
    return shrunk + rest;
}

/**
 * Truncate a URL, keeping the human-meaningful host and path while ellipsizing
 * opaque query params and path segments.
 * @param {string} url
 * @param {import("./internal/primitives.js").TruncateOptions} opts
 * @returns {string}
 */
export function truncateURL(url, opts) {
    return reducePipeline(url, opts, [
        stripProtocol,
        stripWww,
        stripPort,
        ellipsizeQuery,
        ellipsizePath,
        shrinkUrlHost,
        (value, o) => endEllipsis(value, o),
    ]);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd packages/truncator && npx vitest run test/url.test.ts`
Expected: PASS. The exact query/path ellipsization is heuristic; if an assertion on a specific ellipsized form is brittle, keep the structural assertions (`toContain("q=authentik")`, `toContain("…")`) and the budget invariant, which are the contract.

- [ ] **Step 5: Delete the legacy file**

```bash
git rm packages/truncator/lib/legacy.js
```

- [ ] **Step 6: Commit**

```bash
git add packages/truncator/lib/url.js packages/truncator/test/url.test.ts
git commit -m "feat(truncator): port url truncator and remove legacy.js"
```

---

### Task 14: Wire up and verify the public surface

**Files:**
- Verify: `packages/truncator/index.js` (already re-exports all nine modules — no change expected)
- Test: `packages/truncator/test/index.test.ts`

**Interfaces:**
- Consumes: the package's public entry `../index.js`.
- Produces: nothing new; guards the barrel exports.

- [ ] **Step 1: Write the failing test**

`packages/truncator/test/index.test.ts`:
```ts
import { describe, expect, it } from "vitest";

import * as truncator from "../index.js";

describe("package entry", () => {
    it("re-exports every truncator", () => {
        expect(typeof truncator.truncateURL).toBe("function");
        expect(typeof truncator.truncateHash).toBe("function");
        expect(typeof truncator.truncateUUID).toBe("function");
        expect(typeof truncator.truncateMacAddress).toBe("function");
        expect(typeof truncator.truncateIPAddress).toBe("function");
        expect(typeof truncator.truncateEmail).toBe("function");
        expect(typeof truncator.truncateUserAgent).toBe("function");
        expect(typeof truncator.truncateString).toBe("function");
        expect(typeof truncator.truncateNumber).toBe("function");
    });
});
```

- [ ] **Step 2: Run the full suite**

Run: `cd packages/truncator && npx vitest run`
Expected: PASS — all test files green, including `index.test.ts`. If `index.test.ts` fails to import, confirm each `lib/*.js` uses the exact exported names listed in the "Interfaces" blocks above.

- [ ] **Step 3: Type-check and lint the package**

Run: `cd packages/truncator && npm run build && npm run lint-check`
Expected: `tsc -p .` emits declarations with no errors; ESLint passes with zero warnings. Fix any JSDoc type errors surfaced by `checkJs` before committing.

- [ ] **Step 4: Commit**

```bash
git add packages/truncator/test/index.test.ts
git commit -m "test(truncator): assert the public barrel exports"
```

---

## Self-Review

**Spec coverage:**
- Measurer (char default + canvas factory, CanvasLike) → Task 2. ✓
- Common options / plain-string contract → enforced by primitives (Task 3) and every module. ✓
- Three primitives + reducePipeline → Task 3; segment variant added for uuid/mac/ip. ✓
- shrinkHost shared by url + email → Task 4 (consumed in Tasks 10, 13). ✓
- Nine per-type modules → Tasks 5–13. ✓
- user-agent parse & summarize → Task 11. ✓
- number wraps Intl, distinct signature → Task 12. ✓
- url ports legacy then deletes legacy.js → Task 13. ✓
- Package hygiene (description, drop pino, vitest) → Task 1. ✓
- Tests own their vitest config, char-count only → Task 1 config + every test file. ✓
- Barrel exports guarded → Task 14. ✓

**Placeholder scan:** No TBD/TODO; every code step has complete code. Heuristic-output assertions (uuid budget, url query form, ICU casing) carry explicit fallback guidance naming the authoritative invariant. ✓

**Type consistency:** `TruncateOptions` defined once in `primitives.js` and imported by every module. Function names match the `index.js` barrel (`truncateURL`, `truncateHash`, `truncateUUID`, `truncateMacAddress`, `truncateIPAddress`, `truncateEmail`, `truncateUserAgent`, `truncateString`, `truncateNumber`). `segmentEllipsis`/`middleEllipsis`/`endEllipsis`/`reducePipeline`/`shrinkHost`/`compressIPv6` used with consistent signatures across tasks. ✓
