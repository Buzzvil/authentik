import { describe, expect, it } from "vitest";

import { truncateNumber } from "../lib/number.js";

describe("truncateNumber", () => {
    it("compacts millions", () => {
        expect(truncateNumber(1234567, { locale: "en-US" })).toBe("1.2M");
    });

    it("compacts thousands", () => {
        expect(truncateNumber(12500, { locale: "en-US" })).toBe("12.5K");
    });

    it("leaves small numbers as-is", () => {
        expect(truncateNumber(42, { locale: "en-US" })).toBe("42");
    });

    it("respects maximumFractionDigits", () => {
        expect(truncateNumber(1234567, { locale: "en-US", maximumFractionDigits: 0 })).toBe("1M");
    });
});
