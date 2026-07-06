/**
 * @import { TruncateOptions } from "./internal/primitives.js"
 * @file User-agent truncation — parse to a compact "Browser N · OS" summary.
 */

import { endEllipsis } from "./internal/primitives.js";

/**
 * Browser matchers, ordered so Chromium-derived browsers (Edge, Opera, Samsung)
 * are detected before Chrome, and Safari (which relies on the absence of the
 * others) is last.
 * @type {Array<[name: string, re: RegExp]>}
 */
const BROWSER_Pairs = [
    ["Edge", /Edg(?:e|A|iOS)?\/(\d+)/],
    ["Opera", /OPR\/(\d+)/],
    ["Samsung Internet", /SamsungBrowser\/(\d+)/],
    ["Chrome", /Chrome\/(\d+)/],
    ["Firefox", /Firefox\/(\d+)/],
    ["Safari", /Version\/(\d+)[.\d]*\s+.*Safari/],
];

/** @type {Array<[name: string, re: RegExp]>} */
const OS_PAIRS = [
    ["Windows", /Windows NT [\d.]+/],
    ["macOS", /Mac OS X/],
    ["Android", /Android/],
    ["iOS", /iPhone|iPad|iPod/],
    ["Linux", /Linux/],
];

/**
 * Truncate a user-agent string by summarizing it to `"Browser N · OS"`, then
 * end-ellipsizing if the summary is still over budget. Unrecognized agents fall
 * back to end-ellipsizing the raw string.
 *
 * @param {string} input
 * @param {TruncateOptions} options
 *
 * @returns {string}
 */
export function truncateUserAgent(input, options) {
    let browser = "";
    for (const [name, re] of BROWSER_Pairs) {
        const match = input.match(re);

        if (match) {
            browser = match[1] ? `${name} ${match[1]}` : name;

            break;
        }
    }

    let os = "";

    for (const [name, re] of OS_PAIRS) {
        if (re.test(input)) {
            os = name;
            break;
        }
    }

    /** @typedef {string} */
    let summary;

    if (browser && os) {
        summary = `${browser} · ${os}`;
    } else if (browser) {
        summary = browser;
    } else if (os) {
        summary = os;
    } else {
        summary = input;
    }

    return endEllipsis(summary, options);
}
