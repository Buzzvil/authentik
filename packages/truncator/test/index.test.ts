import { describe, expect, it } from "vitest";

import * as truncator from "../index.js";

describe("package entry", () => {
    it("re-exports every truncator", () => {
        expect(typeof truncator.truncateURL).toBe("function");
        expect(typeof truncator.truncateHash).toBe("function");
        expect(typeof truncator.truncateUUID).toBe("function");
        expect(typeof truncator.truncateMacAddress).toBe("function");
        expect(typeof truncator.truncateIPAddress).toBe("function");
        expect(typeof truncator.truncateEmail).toBe("function");
        expect(typeof truncator.truncateUserAgent).toBe("function");
        expect(typeof truncator.truncateString).toBe("function");
        expect(typeof truncator.truncateNumber).toBe("function");
    });
});
