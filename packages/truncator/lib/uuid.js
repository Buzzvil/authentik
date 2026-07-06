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
