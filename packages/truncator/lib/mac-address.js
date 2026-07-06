/**
 * @import { TruncateOptions } from "./internal/primitives.js"
 *
 * @file MAC address truncation — keep whole octets, drop the middle.
 */

import { segmentEllipsis } from "./internal/primitives.js";

/**
 * Truncate a MAC address by dropping whole middle octets.
 * Supports `:` and `-` separators, preserving whichever the input uses.
 *
 * @param {string} input
 * @param {TruncateOptions} options
 *
 * @returns {string}
 */
export function truncateMacAddress(input, options) {
    const separator = input.includes("-") ? "-" : ":";

    return segmentEllipsis(input.split(separator), separator, options);
}
