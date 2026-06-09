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

export function buildChain(msg) {
  const notes = msg?.action_notes || [];

  if (notes.length === 0 && msg?.action_note) {
    return [
      {
        id: `legacy-${msg.id}`,
        author_id: null,
        body: msg.action_note,
        created_at: msg.received_at || null,
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
