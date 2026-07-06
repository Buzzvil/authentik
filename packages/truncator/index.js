export * from "./lib/measurer.js";
export * from "./lib/url.js";
export * from "./lib/hash.js";
export * from "./lib/mac-address.js";
export * from "./lib/ip-address.js";
export * from "./lib/email.js";
export * from "./lib/uuid.js";
export * from "./lib/user-agent.js";
export * from "./lib/string.js";

/**
 * Re-exported so consumers can annotate measurers and options without reaching
 * into internal modules.
 *
 * @typedef {import("./lib/measurer.js").Measurer} Measurer
 * @typedef {import("./lib/measurer.js").CanvasLike} CanvasLike
 * @typedef {import("./lib/internal/primitives.js").TruncateOptions} TruncateOptions
 */
