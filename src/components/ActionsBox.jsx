import React, { useEffect, useState } from "react";
import { ACTION_STATUS } from "../lib/constants";
import {
  buildChain,
  buildEventChain,
  getLatestPreview,
  ENTRY_KIND,
} from "../lib/actionChain";
import "./ActionsBox.css";

const ENTRY_CLASS = {
  [ENTRY_KIND.STATUS_REQUIRED]: "action-note-required",
  [ENTRY_KIND.STATUS_ACTIONED]: "action-note-actioned",
  [ENTRY_KIND.COMMENT]: "action-note-comment",
  [ENTRY_KIND.SYSTEM]: "action-note-system",
};

const ACTIONED_PAGE_SIZE = 10;

const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

const STOP_WORDS = new Set([
  "the","a","an","and","or","of","in","on","for","to","at","by","with","from",
  "is","be","are","was","were","this","that","these","those","your","you","we",
  "us","our","me","my","it","its","as","but","if","not","no","yes","any","all",
  "some","new","day","days","update","info","school","term","fwd","re","subject",
  "received","message","email","mon","tue","wed","thu","fri","sat","sun","week",
  "weeks","year","years","please","note",
]);

function tokenize(str, dropMonths) {
  return (str || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOP_WORDS.has(t))
    .filter((t) => !dropMonths || !MONTHS.includes(t))
    .map((t) => (t.endsWith("s") && t.length > 4 ? t.slice(0, -1) : t));
}

function findEventsByTitleOverlap(subject, events) {
  const subjectTokens = new Set(tokenize(subject, true));
  if (subjectTokens.size < 2) return [];
  const subjectLower = (subject || "").toLowerCase();
  const subjectMonths = MONTHS.filter((m) =>
    new RegExp(`\\b${m}\\b`).test(subjectLower),
  );
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return events.filter((e) => {
    const titleTokens = tokenize(e.title, true);
    let overlap = 0;
    for (const t of titleTokens) if (subjectTokens.has(t)) overlap++;
    if (overlap < 2) return false;
    const eventStart = new Date(e.event_date + "T00:00:00");
    if (eventStart < today) return false;
    if (subjectMonths.length > 0) {
      const eventMonth = MONTHS[eventStart.getMonth()];
      if (!subjectMonths.includes(eventMonth)) return false;
    }
    return true;
  });
}

export function ActionsBox({
  pendingMessages,
  actionedMessages,
  pendingEvents = [],
  events = [],
  profiles,
  onMessageClick,
  onEventClick,
  onEventMarkActioned,
  onEventClear,
  onStatusChange,
  onShowActionModal,
  onAttachmentClick,
  onAddComment,
  onDeleteComment,
  onAddEventComment,
  onDeleteEventComment,
  currentUserId,
  showRecentlyActioned = false,
}) {
  const [expandedId, setExpandedId] = useState(null);
  const [pendingCollapsed, setPendingCollapsed] = useState(true);
  const [actionedCollapsed, setActionedCollapsed] = useState(true);
  const [actionedPage, setActionedPage] = useState(0);
  const [replyDrafts, setReplyDrafts] = useState({});
  const [postingId, setPostingId] = useState(null);

  const postReply = async (recordKey, record, onAdd) => {
    const body = (replyDrafts[recordKey] || "").trim();
    if (!body || !onAdd) return;
    setPostingId(recordKey);
    try {
      await onAdd(record, body);
      setReplyDrafts((d) => ({ ...d, [recordKey]: "" }));
    } finally {
      setPostingId(null);
    }
  };

  const renderComposer = (recordKey, record, onAdd) =>
    onAdd ? (
      <div className="action-reply-composer">
        <textarea
          className="action-reply-input"
          placeholder="Reply…"
          rows={2}
          value={replyDrafts[recordKey] || ""}
          onChange={(e) =>
            setReplyDrafts((d) => ({ ...d, [recordKey]: e.target.value }))
          }
        />
        <button
          className="action-row-btn action-row-btn-action"
          disabled={
            postingId === recordKey || !(replyDrafts[recordKey] || "").trim()
          }
          onClick={() => postReply(recordKey, record, onAdd)}
        >
          {postingId === recordKey ? "Posting…" : "Post Reply"}
        </button>
      </div>
    ) : null;

  const totalActioned = actionedMessages.length;
  const totalActionedPages = Math.max(
    1,
    Math.ceil(totalActioned / ACTIONED_PAGE_SIZE),
  );
  const paginateActioned = !showRecentlyActioned;
  const pagedActioned = paginateActioned
    ? actionedMessages.slice(
        actionedPage * ACTIONED_PAGE_SIZE,
        (actionedPage + 1) * ACTIONED_PAGE_SIZE,
      )
    : actionedMessages;

  useEffect(() => {
    if (actionedPage >= totalActionedPages) setActionedPage(0);
  }, [totalActioned, totalActionedPages, actionedPage]);

  const handleStatusChange = onStatusChange || (() => {});
  const handleShowActionModal = onShowActionModal || (() => {});

  const getUserName = (userId) => profiles[userId]?.display_name || "Unknown";

  const formatDateRange = (linked) => {
    if (!linked || linked.length === 0) return null;
    const sorted = [...linked].sort(
      (a, b) => new Date(a.event_date) - new Date(b.event_date),
    );
    const startStr = sorted[0].event_date;
    const last = sorted[sorted.length - 1];
    const endStr = last.event_end_date || last.event_date;

    const start = new Date(startStr + "T00:00:00");
    const end = new Date(endStr + "T00:00:00");
    const sameDay = startStr === endStr;
    const sameMonth =
      start.getMonth() === end.getMonth() &&
      start.getFullYear() === end.getFullYear();
    const fmt = (d, opts) => d.toLocaleDateString("en-GB", opts);

    if (sameDay) {
      return fmt(start, { day: "numeric", month: "short" });
    }
    if (sameMonth) {
      return `${start.getDate()}–${fmt(end, { day: "numeric", month: "short" })}`;
    }
    return `${fmt(start, { day: "numeric", month: "short" })} – ${fmt(end, { day: "numeric", month: "short" })}`;
  };

  const formatEventDateLabel = (msg) => {
    const attachmentPaths = new Set(
      (msg.attachments || []).map((a) => a.file_path).filter(Boolean),
    );
    let linked = events.filter((e) => {
      if (e.message_id === msg.id) return true;
      const docPath = e.documents?.file_path;
      return docPath && attachmentPaths.has(docPath);
    });

    // Fallback: no FK link to a message/document — try fuzzy title overlap.
    if (linked.length === 0) {
      linked = findEventsByTitleOverlap(msg.subject, events);
    }

    return formatDateRange(linked);
  };

  const formatNoteDate = (dateStr) => {
    const d = new Date(dateStr);
    // Match the en-GB "8 Jun 20:06" style used across the app (e.g. NotesTab)
    return `${d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  };

  const renderChain = (chain, record, onDelete) => {
    if (chain.length === 0) return null;
    return (
      <div className="action-notes-chain">
        {chain.map((e) => {
          const canDelete =
            e.kind === ENTRY_KIND.COMMENT &&
            currentUserId &&
            e.author_id === currentUserId &&
            onDelete;
          return (
            <div
              key={e.id}
              className={`action-note-entry ${ENTRY_CLASS[e.kind]}`}
            >
              <span className="action-note-type-dot" />
              <div className="action-note-body">
                <span className="action-note-text">{e.body}</span>
                <span className="action-note-meta">
                  {e.author_id ? getUserName(e.author_id) : "—"}
                  {e.created_at ? (
                    <> &bull; {formatNoteDate(e.created_at)}</>
                  ) : null}
                  {canDelete && (
                    <button
                      className="action-note-delete"
                      onClick={(ev) => {
                        ev.stopPropagation();
                        onDelete(record, e.id);
                      }}
                    >
                      Delete
                    </button>
                  )}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderCompactRow = (msg, status) => {
    const chain = buildChain(msg);
    const isExpanded = expandedId === msg.id;
    const preview = getLatestPreview(chain, getUserName);
    return (
    <div
      key={msg.id}
      className={`action-row action-row-${status}`}
      onClick={() => setExpandedId(expandedId === msg.id ? null : msg.id)}
    >
      <div className="action-row-header">
        <div className="action-row-info">
          <div className="action-row-subject">
            <span className="action-row-status-dot" />
            <span className="action-row-subject-text">
              {msg.subject || "(No subject)"}
            </span>
            {(() => {
              const label = formatEventDateLabel(msg);
              return label ? (
                <strong className="action-row-event-dates">{label}</strong>
              ) : null;
            })()}
            {chain.length > 0 && (
              <span
                className={`action-row-chevron ${isExpanded ? "open" : ""}`}
                aria-hidden="true"
              >
                ▸
              </span>
            )}
          </div>
          <div className="action-row-meta">
            <span className="action-row-source">{msg.source}</span>
            <span className="action-row-date">
              {new Date(msg.received_at).toLocaleDateString()}
            </span>
          </div>
          {!isExpanded && preview && (
            <div className="action-row-preview">
              <span className="action-row-preview-icon">💬</span>
              {preview.name ? (
                <span className="action-row-preview-author">
                  {preview.name}:
                </span>
              ) : null}{" "}
              <span className="action-row-preview-text">{preview.snippet}</span>
            </div>
          )}
          {msg.attachments && msg.attachments.length > 0 && (
            <div className="action-row-attachments">
              <span className="attachments-label">Attachments:</span>
              <div className="attachments-list">
                {msg.attachments.map((att) => (
                  <button
                    key={att.id}
                    className="attachment-link"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onAttachmentClick) onAttachmentClick(att);
                    }}
                    title={att.filename}
                  >
                    <span className="attachment-icon">
                      {att.mime_type?.includes("pdf")
                        ? "\u{1F4C4}"
                        : "\u{1F4CE}"}
                    </span>
                    <span className="attachment-name">{att.filename}</span>
                    {att.file_size && (
                      <span className="attachment-size">
                        ({Math.round(att.file_size / 1024)}KB)
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="action-row-buttons">
          <button
            className="action-row-btn action-row-btn-note"
            onClick={(e) => {
              e.stopPropagation();
              handleShowActionModal(
                msg,
                status === "pending"
                  ? ACTION_STATUS.REQUIRED
                  : ACTION_STATUS.ACTIONED,
              );
            }}
          >
            Add Note
          </button>
          {status === "pending" && (
            <button
              className="action-row-btn action-row-btn-action"
              onClick={(e) => {
                e.stopPropagation();
                handleShowActionModal(msg, ACTION_STATUS.ACTIONED);
              }}
            >
              Mark as Actioned
            </button>
          )}
          <button
            className="action-row-btn action-row-btn-clear"
            onClick={(e) => {
              e.stopPropagation();
              handleStatusChange(msg, null);
            }}
          >
            Clear
          </button>
          <button
            className="action-row-btn action-row-btn-view"
            onClick={(e) => {
              e.stopPropagation();
              onMessageClick(msg.id);
            }}
          >
            View
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="action-row-expanded" onClick={(e) => e.stopPropagation()}>
          {renderChain(chain, msg, onDeleteComment)}
          {renderComposer(msg.id, msg, onAddComment)}
        </div>
      )}
    </div>
    );
  };

  const renderEventRow = (evt) => {
    const chain = buildEventChain(evt);
    const rowKey = `evt-${evt.id}`;
    const isExpanded = expandedId === rowKey;
    const preview = getLatestPreview(chain, getUserName);
    return (
    <div
      key={evt.id}
      className="action-row action-row-pending"
      onClick={() => setExpandedId(isExpanded ? null : rowKey)}
    >
      <div className="action-row-header">
        <div className="action-row-info">
          <div className="action-row-subject">
            <span className="action-row-status-dot" />
            <span className="action-row-subject-text">{evt.title}</span>
            {(() => {
              const label = formatDateRange([evt]);
              return label ? (
                <strong className="action-row-event-dates">{label}</strong>
              ) : null;
            })()}
            {chain.length > 0 && (
              <span
                className={`action-row-chevron ${isExpanded ? "open" : ""}`}
                aria-hidden="true"
              >
                ▸
              </span>
            )}
          </div>
          <div className="action-row-meta">
            <span className="action-row-source">Calendar</span>
            {evt.event_time && (
              <span className="action-row-date">
                {evt.event_time.slice(0, 5)}
              </span>
            )}
          </div>
          {!isExpanded && preview && (
            <div className="action-row-preview">
              <span className="action-row-preview-icon">💬</span>
              {preview.name ? (
                <span className="action-row-preview-author">
                  {preview.name}:
                </span>
              ) : null}{" "}
              <span className="action-row-preview-text">{preview.snippet}</span>
            </div>
          )}
        </div>
        <div className="action-row-buttons">
          {onEventMarkActioned && (
            <button
              className="action-row-btn action-row-btn-action"
              onClick={(e) => {
                e.stopPropagation();
                onEventMarkActioned(evt);
              }}
            >
              Mark as Actioned
            </button>
          )}
          {onEventClear && (
            <button
              className="action-row-btn action-row-btn-clear"
              onClick={(e) => {
                e.stopPropagation();
                onEventClear(evt);
              }}
            >
              Clear
            </button>
          )}
          <button
            className="action-row-btn action-row-btn-view"
            onClick={(e) => {
              e.stopPropagation();
              onEventClick && onEventClick(evt);
            }}
          >
            Calendar
          </button>
        </div>
      </div>

      {isExpanded && (
        <div
          className="action-row-expanded"
          onClick={(e) => e.stopPropagation()}
        >
          {renderChain(chain, evt, onDeleteEventComment)}
          {renderComposer(rowKey, evt, onAddEventComment)}
        </div>
      )}
    </div>
    );
  };
  const totalPending = pendingMessages.length + pendingEvents.length;

  if (totalPending === 0 && actionedMessages.length === 0) {
    return null;
  }

  return (
    <div className="actions-box">
      {totalPending > 0 && (
        <div className="actions-section">
          <div
            className={`actions-section-title pending${pendingCollapsed ? " collapsed" : ""}`}
            onClick={() => setPendingCollapsed(!pendingCollapsed)}
          >
            <span
              className={`actions-chevron ${pendingCollapsed ? "" : "actions-chevron-open"}`}
            >
              ▸
            </span>
            Action Required ({totalPending})
          </div>
          {!pendingCollapsed && (
            <div className="actions-list">
              {pendingMessages.map((msg) => renderCompactRow(msg, "pending"))}
              {pendingEvents.map((evt) => renderEventRow(evt))}
            </div>
          )}
        </div>
      )}

      {actionedMessages.length > 0 && (
        <div className="actions-section">
          <div
            className={`actions-section-title actioned${actionedCollapsed ? " collapsed" : ""}`}
            onClick={() => setActionedCollapsed(!actionedCollapsed)}
          >
            <span
              className={`actions-chevron ${actionedCollapsed ? "" : "actions-chevron-open"}`}
            >
              ▸
            </span>
            {showRecentlyActioned ? "Recently Actioned" : "Actioned"} (
            {actionedMessages.length})
          </div>
          {!actionedCollapsed && (
            <>
              <div className="actions-list">
                {pagedActioned.map((msg) => renderCompactRow(msg, "actioned"))}
              </div>
              {paginateActioned && totalActioned > ACTIONED_PAGE_SIZE && (
                <div className="actions-pagination">
                  <button
                    className="action-row-btn"
                    disabled={actionedPage === 0}
                    onClick={() => setActionedPage((p) => Math.max(0, p - 1))}
                  >
                    ‹ Prev
                  </button>
                  <span className="actions-pagination-info">
                    Page {actionedPage + 1} of {totalActionedPages} ·{" "}
                    {Math.min(
                      (actionedPage + 1) * ACTIONED_PAGE_SIZE,
                      totalActioned,
                    )}{" "}
                    of {totalActioned}
                  </span>
                  <button
                    className="action-row-btn"
                    disabled={actionedPage >= totalActionedPages - 1}
                    onClick={() =>
                      setActionedPage((p) =>
                        Math.min(totalActionedPages - 1, p + 1),
                      )
                    }
                  >
                    Next ›
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
