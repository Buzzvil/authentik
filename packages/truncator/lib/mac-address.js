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
