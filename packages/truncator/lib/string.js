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
