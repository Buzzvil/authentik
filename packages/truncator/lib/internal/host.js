/**
 * @file Hostname shrinking shared by url and email truncators.
 */

import { characterMeasurer } from "./measurer.js";
import { middleEllipsis } from "./primitives.js";

/**
 * Shrink a hostname to fit, prioritizing the registrable domain + TLD over
 * subdomains. With 3+ labels the subdomains collapse to a single leading
 * ellipsis before domain+TLD are touched; otherwise the whole host is
 * middle-ellipsized.
 * @param {string} host
 * @param {import("./primitives.js").TruncateOptions} opts
 * @returns {string}
 */
export function shrinkHost(host, opts) {
    const measure = opts.measure ?? characterMeasurer;
    const ellipsis = opts.ellipsis ?? "…";
    if (measure(host) <= opts.maxWidth) return host;

    const labels = host.split(".");
    if (labels.length >= 3) {
        const collapsed = ellipsis + "." + labels.slice(-2).join(".");
        if (measure(collapsed) <= opts.maxWidth) return collapsed;
    }
    return middleEllipsis(host, opts);
}
