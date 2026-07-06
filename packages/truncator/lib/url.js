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
    let result = str;
    let prev;
    do {
        prev = result;
        result = result
            .replace(triple, `${sep}${MARK}${sep}`)
            .replace(leading, `${MARK}${sep}`)
            .replace(trailing, `${sep}${MARK}`);
    } while (result !== prev);
    return result;
}

/** @type {(url: string) => string} */
const stripProtocol = (url) => url.replace(/^https?:\/?\/?/i, "");

/** @type {(url: string) => string} */
const stripWww = (url) => url.replace(/^www\./, "");

/** @type {(url: string) => string} */
function stripPort(url) {
    const parts = url.split("/");
    const host = parts[0] ?? "";
    parts[0] = host.split(":")[0] ?? host;
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
        const keyOk = isWordedPart(key ?? "");
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
 * Shrink the host (subdomains before domain+TLD) to whatever budget remains
 * after the path.
 * @type {(url: string, opts: import("./internal/primitives.js").TruncateOptions) => string}
 */
function shrinkUrlHost(url, opts) {
    const slash = url.indexOf("/");
    const host = slash < 0 ? url : url.slice(0, slash);
    const rest = slash < 0 ? "" : url.slice(slash);
    const shrunk = shrinkHost(host, {
        ...opts,
        maxWidth: Math.max(1, opts.maxWidth - rest.length),
    });
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
