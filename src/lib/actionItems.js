import { ACTION_STATUS } from "./constants";

// A unified "action item" model across the three record types that share the
// action-required / actioned workflow: messages, calendar events, and notes.
// Each record is normalised into a common shape so the ActionsBox and the
// Actions page can sort, slice (top 3), and filter them uniformly while still
// rendering each type with its own row style.

export const ITEM_TYPE = {
  MESSAGE: "message",
  EVENT: "event",
  NOTE: "note",
};

export const ITEM_STATUS = {
  REQUIRED: "required",
  ACTIONED: "actioned",
};

export const SOURCE = {
  ARBOR: "Arbor",
  GMAIL: "Gmail",
  CALENDAR: "Calendar",
  NOTE: "Note",
};

function messageSource(src) {
  if (src === "arbor") return SOURCE.ARBOR;
  if (src === "gmail") return SOURCE.GMAIL;
  return src || "Message";
}

function joinSearch(parts) {
  return parts.filter(Boolean).join(" ").toLowerCase();
}

export function messageToItem(msg) {
  if (!msg) return null;
  const isActioned = msg.action_status === ACTION_STATUS.ACTIONED;
  const isRequired =
    msg.action_status === ACTION_STATUS.REQUIRED ||
    msg.action_status === "pending";
  if (!isActioned && !isRequired) return null;
  return {
    key: `msg-${msg.id}`,
    type: ITEM_TYPE.MESSAGE,
    id: msg.id,
    title: msg.subject || "(No subject)",
    source: messageSource(msg.source),
    status: isActioned ? ITEM_STATUS.ACTIONED : ITEM_STATUS.REQUIRED,
    actionedAt: isActioned ? msg.actioned_at || null : null,
    pendingAt: msg.updated_at || msg.received_at || null,
    searchText: joinSearch([
      msg.subject,
      msg.action_note,
      ...(msg.action_notes || []).map((n) => n.note),
    ]),
    raw: msg,
  };
}

export function eventToItem(evt) {
  if (!evt) return null;
  const isActioned = !!evt.actioned_at;
  const isRequired = !!evt.action_required && !isActioned;
  if (!isActioned && !isRequired) return null;
  return {
    key: `evt-${evt.id}`,
    type: ITEM_TYPE.EVENT,
    id: evt.id,
    title: evt.title || "(Untitled event)",
    source: SOURCE.CALENDAR,
    status: isActioned ? ITEM_STATUS.ACTIONED : ITEM_STATUS.REQUIRED,
    actionedAt: isActioned ? evt.actioned_at : null,
    pendingAt: evt.event_date || null,
    searchText: joinSearch([
      evt.title,
      evt.description,
      evt.action_detail,
      ...(evt.event_notes || []).map((n) => n.note),
    ]),
    raw: evt,
  };
}

export function noteToItem(note) {
  if (!note) return null;
  const isActioned = !!note.actioned_at;
  const isRequired = !!note.action_required && !isActioned;
  if (!isActioned && !isRequired) return null;
  return {
    key: `note-${note.id}`,
    type: ITEM_TYPE.NOTE,
    id: note.id,
    title: note.title || "(Untitled note)",
    source: SOURCE.NOTE,
    status: isActioned ? ITEM_STATUS.ACTIONED : ITEM_STATUS.REQUIRED,
    actionedAt: isActioned ? note.actioned_at : null,
    pendingAt: note.updated_at || note.created_at || null,
    searchText: joinSearch([
      note.title,
      note.body,
      ...(note.note_replies || []).map((r) => r.body),
    ]),
    raw: note,
  };
}

const byActionedDesc = (a, b) =>
  new Date(b.actionedAt || 0) - new Date(a.actionedAt || 0);
const byPendingDesc = (a, b) =>
  new Date(b.pendingAt || 0) - new Date(a.pendingAt || 0);
const byEventDateAsc = (a, b) =>
  new Date(a.pendingAt || 0) - new Date(b.pendingAt || 0);

// Normalise all three record types into { pending, actioned } lists.
// - actioned: every actioned item, merged and sorted by actioned time (newest first)
// - pending: grouped by type in a useful order — messages newest-first,
//   events soonest-first (upcoming), notes newest-first — then concatenated.
export function buildActionItems({ messages = [], events = [], notes = [] }) {
  const items = [
    ...messages.map(messageToItem),
    ...events.map(eventToItem),
    ...notes.map(noteToItem),
  ].filter(Boolean);

  const actioned = items
    .filter((i) => i.status === ITEM_STATUS.ACTIONED && i.actionedAt)
    .sort(byActionedDesc);

  const pendingOf = (type, sorter) =>
    items
      .filter((i) => i.status === ITEM_STATUS.REQUIRED && i.type === type)
      .sort(sorter);

  const pending = [
    ...pendingOf(ITEM_TYPE.MESSAGE, byPendingDesc),
    ...pendingOf(ITEM_TYPE.EVENT, byEventDateAsc),
    ...pendingOf(ITEM_TYPE.NOTE, byPendingDesc),
  ];

  return { pending, actioned };
}

export function topActioned(actioned, n = 3) {
  return actioned.slice(0, n);
}

// Filter predicate for the Actions-page actioned list. All criteria are
// additive (AND). Empty / missing criteria are treated as "no constraint".
export function filterActionItems(items, { types, sources, search } = {}) {
  const q = (search || "").trim().toLowerCase();
  return items.filter((i) => {
    if (types && types.length && !types.includes(i.type)) return false;
    if (sources && sources.length && !sources.includes(i.source)) return false;
    if (q && !i.searchText.includes(q)) return false;
    return true;
  });
}
