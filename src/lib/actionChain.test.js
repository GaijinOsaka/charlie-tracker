import { describe, it, expect } from "vitest";
import {
  ENTRY_KIND,
  classifyEntry,
  buildChain,
  getLatestPreview,
} from "./actionChain";

describe("actionChain", () => {
  describe("classifyEntry", () => {
    it("maps action_required to a status entry", () => {
      expect(classifyEntry("action_required")).toBe(ENTRY_KIND.STATUS_REQUIRED);
    });
    it("maps actioned to a status entry", () => {
      expect(classifyEntry("actioned")).toBe(ENTRY_KIND.STATUS_ACTIONED);
    });
    it("maps comment to a comment entry", () => {
      expect(classifyEntry("comment")).toBe(ENTRY_KIND.COMMENT);
    });
    it("treats unknown/null as a comment", () => {
      expect(classifyEntry(null)).toBe(ENTRY_KIND.COMMENT);
    });
  });

  describe("buildChain", () => {
    it("normalizes and sorts action_notes oldest-first", () => {
      const msg = {
        id: "m1",
        action_notes: [
          {
            id: "b",
            user_id: "u2",
            note: "second",
            action_type: "comment",
            created_at: "2026-06-09T10:00:00Z",
          },
          {
            id: "a",
            user_id: "u1",
            note: "first",
            action_type: "action_required",
            created_at: "2026-06-08T09:00:00Z",
          },
        ],
      };
      const chain = buildChain(msg);
      expect(chain.map((e) => e.id)).toEqual(["a", "b"]);
      expect(chain[0]).toMatchObject({
        author_id: "u1",
        body: "first",
        kind: ENTRY_KIND.STATUS_REQUIRED,
      });
      expect(chain[1]).toMatchObject({
        author_id: "u2",
        body: "second",
        kind: ENTRY_KIND.COMMENT,
      });
    });

    it("renders a legacy action_note as a single system entry", () => {
      const msg = {
        id: "m2",
        action_note: "old text",
        received_at: "2026-06-01T00:00:00Z",
      };
      const chain = buildChain(msg);
      expect(chain).toHaveLength(1);
      expect(chain[0]).toMatchObject({
        author_id: null,
        body: "old text",
        kind: ENTRY_KIND.SYSTEM,
      });
    });

    it("prefers action_notes rows over the legacy field", () => {
      const msg = {
        id: "m3",
        action_note: "legacy",
        action_notes: [
          {
            id: "x",
            user_id: "u1",
            note: "real",
            action_type: "comment",
            created_at: "2026-06-09T10:00:00Z",
          },
        ],
      };
      const chain = buildChain(msg);
      expect(chain).toHaveLength(1);
      expect(chain[0].body).toBe("real");
    });

    it("returns an empty array when there are no notes", () => {
      expect(buildChain({ id: "m4" })).toEqual([]);
    });
  });

  describe("getLatestPreview", () => {
    const getName = (id) => ({ u1: "Clare", u2: "David" })[id] || "Unknown";

    it("returns the newest entry with author name and snippet", () => {
      const chain = [
        {
          id: "a",
          author_id: "u1",
          body: "ask mum if ok",
          kind: ENTRY_KIND.STATUS_REQUIRED,
        },
        {
          id: "b",
          author_id: "u2",
          body: "That's great, thank you",
          kind: ENTRY_KIND.COMMENT,
        },
      ];
      expect(getLatestPreview(chain, getName)).toMatchObject({
        name: "David",
        snippet: "That's great, thank you",
        kind: ENTRY_KIND.COMMENT,
      });
    });

    it("truncates long snippets to maxLen with an ellipsis", () => {
      const long = "x".repeat(80);
      const chain = [
        { id: "a", author_id: "u2", body: long, kind: ENTRY_KIND.COMMENT },
      ];
      const preview = getLatestPreview(chain, getName, 60);
      expect(preview.snippet.endsWith("…")).toBe(true);
      expect(preview.snippet.length).toBeLessThanOrEqual(61);
    });

    it("returns no name for a system entry", () => {
      const chain = [
        { id: "a", author_id: null, body: "old", kind: ENTRY_KIND.SYSTEM },
      ];
      expect(getLatestPreview(chain, getName).name).toBeNull();
    });

    it("returns null for an empty chain", () => {
      expect(getLatestPreview([], getName)).toBeNull();
    });
  });
});
