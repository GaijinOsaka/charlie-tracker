import { ACTION_STATUS, ACTION_NOTE_COMMENT } from "./constants";

export const ENTRY_KIND = {
  STATUS_REQUIRED: "status-required",
  STATUS_ACTIONED: "status-actioned",
  COMMENT: "comment",
  SYSTEM: "system",
};

export function classifyEntry(actionType) {
  if (actionType === ACTION_STATUS.REQUIRED) return ENTRY_KIND.STATUS_REQUIRED;
  if (actionType === ACTION_STATUS.ACTIONED) return ENTRY_KIND.STATUS_ACTIONED;
  if (actionType === ACTION_NOTE_COMMENT) return ENTRY_KIND.COMMENT;
  return ENTRY_KIND.COMMENT; // null / unknown → treat as a neutral comment
}

// Shared core: turn a record's note rows (+ optional legacy single field) into
// a normalized, sorted chain. Used by both messages and events.
function buildChainCore({
  notes,
  legacyId,
  legacyBody,
  legacyDate,
  legacyAuthorId,
}) {
  if (notes.length === 0 && legacyBody) {
    // A legacy single-field note (event action_detail / message action_note)
    // has no per-note author column. When the parent record exposes a sensible
    // author (e.g. an event's creator), attribute the entry to them so it shows
    // a name rather than an anonymous "system" entry.
    return [
      {
        id: legacyId,
        author_id: legacyAuthorId || null,
        body: legacyBody,
        created_at: legacyDate || null,
        kind: legacyAuthorId ? ENTRY_KIND.STATUS_REQUIRED : ENTRY_KIND.SYSTEM,
      },
    ];
  }

  return notes
    .map((n) => ({
      id: n.id,
      author_id: n.user_id,
      body: n.note,
      created_at: n.created_at,
      kind: classifyEntry(n.action_type),
    }))
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
}

export function buildChain(msg) {
  return buildChainCore({
    notes: msg?.action_notes || [],
    legacyId: `legacy-${msg?.id}`,
    legacyBody: msg?.action_note,
    legacyDate: msg?.received_at,
  });
}

export function buildEventChain(evt) {
  return buildChainCore({
    notes: evt?.event_notes || [],
    legacyId: `legacy-evt-${evt?.id}`,
    legacyBody: evt?.action_detail,
    legacyDate: evt?.created_at,
    legacyAuthorId: evt?.created_by,
  });
}

// Notes use `note_replies` (author_id/body, no action_type) as their chain, and
// the note body itself as the opening entry. Normalise to the same shape.
export function buildNoteChain(note) {
  const opening = note?.body
    ? [
        {
          id: `note-body-${note.id}`,
          author_id: note.author_id || null,
          body: note.body,
          created_at: note.created_at || null,
          kind: ENTRY_KIND.STATUS_REQUIRED,
        },
      ]
    : [];

  const replies = (note?.note_replies || [])
    .map((r) => ({
      id: r.id,
      author_id: r.author_id,
      body: r.body,
      created_at: r.created_at,
      kind: ENTRY_KIND.COMMENT,
    }))
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  return [...opening, ...replies];
}

function truncate(text, maxLen) {
  if (!text) return "";
  return text.length > maxLen ? text.slice(0, maxLen).trimEnd() + "…" : text;
}

export function getLatestPreview(chain, getName, maxLen = 60) {
  if (!chain || chain.length === 0) return null;
  const last = chain[chain.length - 1];
  return {
    name: last.author_id ? getName(last.author_id) : null,
    snippet: truncate(last.body, maxLen),
    kind: last.kind,
  };
}
