/**
 * @file Email truncation — shrink the local part first, then the domain.
 */

import { characterMeasurer } from "./internal/measurer.js";
import { shrinkHost } from "./internal/host.js";
import { endEllipsis, middleEllipsis } from "./internal/primitives.js";

/**
 * Truncate an email address. The local part is middle-ellipsized first while the
 * `@domain` is kept intact; if that still doesn't fit, the domain is shrunk via
 * {@link shrinkHost}.
 * @param {string} value
 * @param {import("./internal/primitives.js").TruncateOptions} opts
 * @returns {string}
 */
export function truncateEmail(value, opts) {
    const measure = opts.measure ?? characterMeasurer;
    const ellipsis = opts.ellipsis ?? "…";
    if (measure(value) <= opts.maxWidth) return value;

    const at = value.lastIndexOf("@");
    if (at === -1) return middleEllipsis(value, opts);

    const local = value.slice(0, at);
    const domain = value.slice(at + 1);

    // 1) Shrink only the local part, keeping "@domain" intact.
    const suffix = "@" + domain;
    const localBudget = opts.maxWidth - measure(suffix);
    if (localBudget >= measure(ellipsis)) {
        const candidate = middleEllipsis(local, { ...opts, maxWidth: localBudget }) + suffix;
        if (measure(candidate) <= opts.maxWidth) return candidate;
    }

    // 2) Shrink the domain too. Keep a minimal local head, ellipsize the domain,
    //    then hard-cut the whole thing to guarantee the budget.
    const domainBudget = Math.max(measure(ellipsis), opts.maxWidth - measure("x@"));
    const shrunkDomain = shrinkHost(domain, { ...opts, maxWidth: domainBudget });
    return endEllipsis(local.charAt(0) + "…@" + shrunkDomain, opts);
}
