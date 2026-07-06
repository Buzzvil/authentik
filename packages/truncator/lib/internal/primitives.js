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

    /**
     * @param {number} h
     * @param {number} t
     */
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
        /**
         * @param {number} h
         * @param {number} t
         */
        const build = (h, t) =>
            [...segments.slice(0, h), ellipsis, ...segments.slice(segments.length - t)].join(
                separator,
            );

        if (measure(build(1, 1)) <= maxWidth) {
            let head = 1;
            let tail = 1;
            while (head + tail < segments.length) {
                const growHead = head / (head + tail) < headBias;
                /** @type {[number, number]} */
                const primary = growHead ? [head + 1, tail] : [head, tail + 1];
                /** @type {[number, number]} */
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
