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
function buildChainCore({ notes, legacyId, legacyBody, legacyDate }) {
  if (notes.length === 0 && legacyBody) {
    return [
      {
        id: legacyId,
        author_id: null,
        body: legacyBody,
        created_at: legacyDate || null,
        kind: ENTRY_KIND.SYSTEM,
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
  });
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
