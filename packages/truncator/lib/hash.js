/**
 * @import { TruncateOptions } from "./internal/primitives.js"
 * @file Hash / digest truncation (git SHAs, sha256, md5, opaque hex/base64).
 */

import { middleEllipsis } from "./internal/primitives.js";

/**
 * Truncate an opaque digest, keeping a head-biased prefix (grep, cf. git short-SHA)
 * plus a tail for disambiguation.
 *
 * @param {string} input The digest to truncate.
 * @param {TruncateOptions} options
 *
 * @returns {string}
 */
export function truncateHash(input, options) {
    return middleEllipsis(input, options, { headBias: 0.6 });
}
