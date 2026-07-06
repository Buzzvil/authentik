/**
 * @file Width measurement for truncation.
 *
 * The default {@link characterMeasurer} counts characters, keeping the
 * truncation algorithms pure and SSR-safe. DOM callers pass a measurer built
 * from {@link createCanvasMeasurer} to fit a real rendered pixel width.
 */

/**
 * A cost function: how wide is `text`, in whatever unit the caller cares about.
 * @typedef {(text: string) => number} Measurer
 */

/**
 * @typedef {OffscreenCanvas | HTMLCanvasElement} CanvasLike
 */

/**
 * The default measurer: one unit per character.
 * @type {Measurer}
 */
export function characterMeasurer(text) {
    return text.length;
}

/**
 * Build a measurer backed by a canvas 2D context's `measureText`.
 *
 * Not unit-tested — it is a thin wrapper over the platform `measureText`. A
 * single `OffscreenCanvas` may be shared across many measurers.
 *
 * @param {CanvasLike} canvas
 * @param {string} font A CSS font shorthand, e.g. `"14px 'RedHatMono'"`.
 * @returns {Measurer}
 */
export function createCanvasMeasurer(canvas, font) {
    const ctx = /** @type {CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null} */ (
        canvas.getContext("2d")
    );

    if (!ctx) {
        throw new Error("truncator: failed to acquire a 2D canvas context");
    }

    ctx.font = font;

    return (text) => ctx.measureText(text).width;
}
