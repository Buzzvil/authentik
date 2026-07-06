/**
 * @import { TruncateOptions } from "./internal/primitives.js"
 *
 * @file UUID truncation — keep whole hyphen-delimited segments.
 */

import { segmentEllipsis } from "./internal/primitives.js";

/**
 * Truncate a UUID by dropping whole middle segments, keeping the first and last.
 *
 * @param {string} input
 * @param {TruncateOptions} options
 *
 * @returns {string}
 */
export function truncateUUID(input, options) {
    return segmentEllipsis(input.split("-"), "-", options);
}
