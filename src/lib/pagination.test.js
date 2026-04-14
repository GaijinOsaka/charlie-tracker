import { describe, it, expect } from "vitest";
import { getPaginatedMessages, calculateTotalPages } from "./pagination";

describe("pagination utilities", () => {
  describe("calculateTotalPages", () => {
    it("returns 1 page for 20 messages", () => {
      expect(calculateTotalPages(20)).toBe(1);
    });

    it("returns 2 pages for 40 messages", () => {
      expect(calculateTotalPages(40)).toBe(2);
    });

    it("returns 3 pages for 60 messages", () => {
      expect(calculateTotalPages(60)).toBe(3);
    });

    it("returns 3 pages for 50 messages", () => {
      expect(calculateTotalPages(50)).toBe(3);
    });

    it("returns 1 page for 0 messages", () => {
      expect(calculateTotalPages(0)).toBe(1);
    });
  });

  describe("getPaginatedMessages", () => {
    const mockMessages = Array.from({ length: 60 }, (_, i) => ({
      id: `msg-${60 - i}`,
      content: `Message ${60 - i}`,
    }));

    it("returns first 20 messages for page 1", () => {
      const result = getPaginatedMessages(mockMessages, 1);
      expect(result.length).toBe(20);
      expect(result[0].id).toBe("msg-60");
      expect(result[19].id).toBe("msg-41");
    });

    it("returns next 20 messages for page 2", () => {
      const result = getPaginatedMessages(mockMessages, 2);
      expect(result.length).toBe(20);
      expect(result[0].id).toBe("msg-40");
      expect(result[19].id).toBe("msg-21");
    });

    it("returns remaining messages for page 3", () => {
      const result = getPaginatedMessages(mockMessages, 3);
      expect(result.length).toBe(20);
      expect(result[0].id).toBe("msg-20");
      expect(result[19].id).toBe("msg-1");
    });

    it("returns empty array for invalid page number", () => {
      const result = getPaginatedMessages(mockMessages, 4);
      expect(result.length).toBe(0);
    });

    it("returns first page for page 0 or negative", () => {
      const result = getPaginatedMessages(mockMessages, 0);
      expect(result.length).toBe(20);
      expect(result[0].id).toBe("msg-60");
    });

    it("handles less than 20 messages on last page", () => {
      const smallSet = mockMessages.slice(0, 35);
      const result = getPaginatedMessages(smallSet, 2);
      expect(result.length).toBe(15);
      expect(result[0].id).toBe("msg-40");
    });
  });
});
