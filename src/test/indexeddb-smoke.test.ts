import { describe, it, expect } from "vitest";

describe("fake-indexeddb setup", () => {
  it("provides a global indexedDB object", () => {
    expect(typeof indexedDB).toBe("object");
    expect(indexedDB).not.toBeNull();
  });
});
