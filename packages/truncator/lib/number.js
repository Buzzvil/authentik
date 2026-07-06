/**
 * @file Number truncation — compact notation via Intl.NumberFormat.
 */

/**
 * @typedef {object} NumberTruncateOptions
 * @property {string} [locale] BCP 47 locale; defaults to the runtime locale.
 * @property {number} [maximumFractionDigits] Precision of the compact form; defaults to 1.
 */

/**
 * Format a number compactly for display (e.g. `1234567 → "1.2M"`), locale-aware.
 * Unlike the string truncators this is width-agnostic — compact notation is the
 * natural way to "truncate" a number.
 * @param {number} value
 * @param {NumberTruncateOptions} [opts]
 * @returns {string}
 */
export function truncateNumber(value, opts = {}) {
    return new Intl.NumberFormat(opts.locale, {
        notation: "compact",
        maximumFractionDigits: opts.maximumFractionDigits ?? 1,
    }).format(value);
}
