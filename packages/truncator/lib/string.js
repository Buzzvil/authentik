/**
 * @import { TruncateOptions } from "./internal/primitives.js"
 *
 * @file Generic string truncation.
 */

import { endEllipsis, middleEllipsis } from "./internal/primitives.js";

/**
 * @typedef {TruncateOptions & { mode?: "end" | "middle" }} StringTruncateOptions
 */

/**
 * Truncate an arbitrary string. Defaults to end-ellipsis;
 * pass `mode: "middle"` to keep both ends.
 *
 * @param {string} input
 * @param {StringTruncateOptions} options
 *
 * @returns {string}
 */
export function truncateString(input, options) {
    if (options.mode === "middle") {
        return middleEllipsis(input, options);
    }

    return endEllipsis(input, options);
}
