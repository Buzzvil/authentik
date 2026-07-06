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
