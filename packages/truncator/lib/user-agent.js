/**
 * @file User-agent truncation — parse to a compact "Browser N · OS" summary.
 */

import { endEllipsis } from "./internal/primitives.js";

/**
 * Browser matchers, ordered so Chromium-derived browsers (Edge, Opera, Samsung)
 * are detected before Chrome, and Safari (which relies on the absence of the
 * others) is last.
 * @type {Array<{ name: string, re: RegExp }>}
 */
const BROWSERS = [
    { name: "Edge", re: /Edg(?:e|A|iOS)?\/(\d+)/ },
    { name: "Opera", re: /OPR\/(\d+)/ },
    { name: "Samsung Internet", re: /SamsungBrowser\/(\d+)/ },
    { name: "Chrome", re: /Chrome\/(\d+)/ },
    { name: "Firefox", re: /Firefox\/(\d+)/ },
    { name: "Safari", re: /Version\/(\d+)[.\d]*\s+.*Safari/ },
];

/** @type {Array<{ name: string, re: RegExp }>} */
const OSES = [
    { name: "Windows", re: /Windows NT [\d.]+/ },
    { name: "macOS", re: /Mac OS X/ },
    { name: "Android", re: /Android/ },
    { name: "iOS", re: /iPhone|iPad|iPod/ },
    { name: "Linux", re: /Linux/ },
];

/**
 * Truncate a user-agent string by summarizing it to `"Browser N · OS"`, then
 * end-ellipsizing if the summary is still over budget. Unrecognized agents fall
 * back to end-ellipsizing the raw string.
 * @param {string} value
 * @param {import("./internal/primitives.js").TruncateOptions} opts
 * @returns {string}
 */
export function truncateUserAgent(value, opts) {
    let browser = "";
    for (const candidate of BROWSERS) {
        const match = value.match(candidate.re);
        if (match) {
            browser = match[1] ? `${candidate.name} ${match[1]}` : candidate.name;
            break;
        }
    }

    let os = "";
    for (const candidate of OSES) {
        if (candidate.re.test(value)) {
            os = candidate.name;
            break;
        }
    }

    let summary;
    if (browser && os) summary = `${browser} · ${os}`;
    else if (browser) summary = browser;
    else if (os) summary = os;
    else summary = value;

    return endEllipsis(summary, opts);
}
