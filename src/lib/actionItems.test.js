import { describe, it, expect } from "vitest";
import {
  ITEM_TYPE,
  ITEM_STATUS,
  SOURCE,
  messageToItem,
  eventToItem,
  noteToItem,
  buildActionItems,
  topActioned,
  filterActionItems,
} from "./actionItems";

describe("actionItems", () => {
  describe("messageToItem", () => {
    it("normalises an action-required message", () => {
      const item = messageToItem({
        id: "m1",
        subject: "Trip form",
        source: "gmail",
        action_status: "action_required",
        updated_at: "2026-06-10T09:00:00Z",
        received_at: "2026-06-09T09:00:00Z",
      });
      expect(item).toMatchObject({
        type: ITEM_TYPE.MESSAGE,
        status: ITEM_STATUS.REQUIRED,
        source: SOURCE.GMAIL,
        actionedAt: null,
        title: "Trip form",
      });
    });

    it("normalises an actioned message with actioned_at", () => {
      const item = messageToItem({
        id: "m2",
        subject: "Paid",
        source: "arbor",
        action_status: "actioned",
        actioned_at: "2026-06-11T12:00:00Z",
      });
      expect(item.status).toBe(ITEM_STATUS.ACTIONED);
      expect(item.actionedAt).toBe("2026-06-11T12:00:00Z");
      expect(item.source).toBe(SOURCE.ARBOR);
    });

    it("returns null for a message with no action state", () => {
      expect(messageToItem({ id: "m3", action_status: null })).toBeNull();
    });

    it("includes subject and note chain in searchText", () => {
      const item = messageToItem({
        id: "m4",
        subject: "Swimming",
        action_status: "action_required",
        action_notes: [{ note: "bring towel" }],
      });
      expect(item.searchText).toContain("swimming");
      expect(item.searchText).toContain("towel");
    });
  });

  describe("eventToItem", () => {
    it("treats action_required without actioned_at as required", () => {
      const item = eventToItem({
        id: "e1",
        title: "Sports day",
        action_required: true,
        event_date: "2026-07-01",
      });
      expect(item.status).toBe(ITEM_STATUS.REQUIRED);
      expect(item.source).toBe(SOURCE.CALENDAR);
      expect(item.pendingAt).toBe("2026-07-01");
    });

    it("treats actioned_at as actioned even if action_required lingers", () => {
      const item = eventToItem({
        id: "e2",
        title: "Charlie hole with Clair",
        action_required: false,
        actioned_at: "2026-06-11T10:00:00Z",
      });
      expect(item.status).toBe(ITEM_STATUS.ACTIONED);
      expect(item.actionedAt).toBe("2026-06-11T10:00:00Z");
    });

    it("returns null for a plain event", () => {
      expect(
        eventToItem({ id: "e3", title: "Term starts", action_required: false }),
      ).toBeNull();
    });
  });

  describe("noteToItem", () => {
    it("normalises an action-required note", () => {
      const item = noteToItem({
        id: "n1",
        title: "Chase uniform order",
        action_required: true,
        created_at: "2026-06-10T08:00:00Z",
      });
      expect(item).toMatchObject({
        type: ITEM_TYPE.NOTE,
        status: ITEM_STATUS.REQUIRED,
        source: SOURCE.NOTE,
      });
    });

    it("normalises an actioned note and includes replies in searchText", () => {
      const item = noteToItem({
        id: "n2",
        title: "Permission",
        body: "needs signing",
        actioned_at: "2026-06-11T11:00:00Z",
        note_replies: [{ body: "done now" }],
      });
      expect(item.status).toBe(ITEM_STATUS.ACTIONED);
      expect(item.searchText).toContain("signing");
      expect(item.searchText).toContain("done now");
    });

    it("returns null for a note with no action state", () => {
      expect(noteToItem({ id: "n3", title: "random" })).toBeNull();
    });
  });

  describe("buildActionItems", () => {
    const data = {
      messages: [
        {
          id: "m1",
          subject: "Older actioned",
          action_status: "actioned",
          actioned_at: "2026-06-09T10:00:00Z",
        },
        {
          id: "m2",
          subject: "Pending msg",
          action_status: "action_required",
          updated_at: "2026-06-10T10:00:00Z",
        },
      ],
      events: [
        {
          id: "e1",
          title: "Newest actioned",
          actioned_at: "2026-06-11T10:00:00Z",
        },
        {
          id: "e2",
          title: "Pending event",
          action_required: true,
          event_date: "2026-07-01",
        },
      ],
      notes: [
        {
          id: "n1",
          title: "Mid actioned",
          actioned_at: "2026-06-10T10:00:00Z",
        },
      ],
    };

    it("sorts actioned items newest-actioned first across all types", () => {
      const { actioned } = buildActionItems(data);
      expect(actioned.map((i) => i.id)).toEqual(["e1", "n1", "m1"]);
    });

    it("groups pending by type: messages, then events, then notes", () => {
      const { pending } = buildActionItems(data);
      expect(pending.map((i) => i.id)).toEqual(["m2", "e2"]);
    });

    it("excludes records with no action state", () => {
      const { pending, actioned } = buildActionItems({
        messages: [{ id: "x", action_status: null }],
        events: [{ id: "y", action_required: false }],
        notes: [{ id: "z", title: "n" }],
      });
      expect(pending).toEqual([]);
      expect(actioned).toEqual([]);
    });
  });

  describe("topActioned", () => {
    it("returns at most n items", () => {
      const list = [1, 2, 3, 4, 5].map((n) => ({ id: n }));
      expect(topActioned(list, 3)).toHaveLength(3);
      expect(topActioned(list, 3).map((i) => i.id)).toEqual([1, 2, 3]);
    });
  });

  describe("filterActionItems", () => {
    const items = [
      { type: ITEM_TYPE.MESSAGE, source: SOURCE.GMAIL, searchText: "swimming trip" },
      { type: ITEM_TYPE.EVENT, source: SOURCE.CALENDAR, searchText: "sports day" },
      { type: ITEM_TYPE.NOTE, source: SOURCE.NOTE, searchText: "uniform order" },
    ];

    it("returns all items when no criteria given", () => {
      expect(filterActionItems(items, {})).toHaveLength(3);
    });

    it("filters by type", () => {
      const out = filterActionItems(items, { types: [ITEM_TYPE.EVENT] });
      expect(out).toHaveLength(1);
      expect(out[0].type).toBe(ITEM_TYPE.EVENT);
    });

    it("filters by source", () => {
      const out = filterActionItems(items, { sources: [SOURCE.NOTE] });
      expect(out).toHaveLength(1);
    });

    it("filters by case-insensitive text search", () => {
      const out = filterActionItems(items, { search: "SPORTS" });
      expect(out).toHaveLength(1);
      expect(out[0].type).toBe(ITEM_TYPE.EVENT);
    });

    it("combines criteria additively", () => {
      const out = filterActionItems(items, {
        types: [ITEM_TYPE.MESSAGE, ITEM_TYPE.NOTE],
        search: "uniform",
      });
      expect(out).toHaveLength(1);
      expect(out[0].type).toBe(ITEM_TYPE.NOTE);
    });
  });
});
