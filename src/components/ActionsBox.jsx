import React, { useState } from "react";
import { ACTION_STATUS } from "../lib/constants";
import "./ActionsBox.css";

export function ActionsBox({
  pendingMessages,
  actionedMessages,
  pendingEvents = [],
  profiles,
  onMessageClick,
  onEventClick,
  onStatusChange,
  onShowActionModal,
  onAttachmentClick,
  showRecentlyActioned = false,
}) {
  const [expandedId, setExpandedId] = useState(null);
  const [pendingCollapsed, setPendingCollapsed] = useState(true);
  const [actionedCollapsed, setActionedCollapsed] = useState(true);

  const handleStatusChange = onStatusChange || (() => {});
  const handleShowActionModal = onShowActionModal || (() => {});

  const getUserName = (userId) => profiles[userId]?.display_name || "Unknown";

  const formatNoteDate = (dateStr) => {
    const d = new Date(dateStr);
    return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  };

  const renderNotes = (msg) => {
    const notes = msg.action_notes || [];
    if (notes.length === 0 && msg.action_note) {
      // Fallback to legacy single note
      return (
        <div className="action-notes-chain">
          <div className="action-note-entry">
            <span className="action-note-text">{msg.action_note}</span>
          </div>
        </div>
      );
    }
    if (notes.length === 0) return null;

    const sorted = [...notes].sort(
      (a, b) => new Date(a.created_at) - new Date(b.created_at),
    );

    return (
      <div className="action-notes-chain">
        {sorted.map((n) => (
          <div
            key={n.id}
            className={`action-note-entry action-note-${n.action_type === "actioned" ? "actioned" : "required"}`}
          >
            <span className="action-note-type-dot" />
            <div className="action-note-body">
              <span className="action-note-text">{n.note}</span>
              <span className="action-note-meta">
                {getUserName(n.user_id)} &bull; {formatNoteDate(n.created_at)}
              </span>
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderCompactRow = (msg, status) => (
    <div
      key={msg.id}
      className={`action-row action-row-${status}`}
      onClick={() => setExpandedId(expandedId === msg.id ? null : msg.id)}
    >
      <div className="action-row-header">
        <div className="action-row-status-dot" />
        <div className="action-row-info">
          <div className="action-row-subject">
            {msg.subject || "(No subject)"}
          </div>
          <div className="action-row-meta">
            <span className="action-row-source">{msg.source}</span>
            <span className="action-row-date">
              {new Date(msg.received_at).toLocaleDateString()}
            </span>
          </div>
          {renderNotes(msg)}
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

      {expandedId === msg.id && (
        <div className="action-row-expanded">
          <div className="action-row-content">{msg.content}</div>
        </div>
      )}
    </div>
  );

  const renderEventRow = (evt) => (
    <div
      key={evt.id}
      className="action-row action-row-pending"
      onClick={() => onEventClick && onEventClick(evt)}
    >
      <div className="action-row-header">
        <div className="action-row-status-dot" />
        <div className="action-row-info">
          <div className="action-row-subject">{evt.title}</div>
          <div className="action-row-meta">
            <span className="action-row-source">Calendar</span>
            <span className="action-row-date">
              {new Date(evt.event_date + "T00:00:00").toLocaleDateString()}
              {evt.event_time && ` · ${evt.event_time.slice(0, 5)}`}
            </span>
          </div>
          {evt.action_detail && (
            <div className="action-notes-chain">
              <div className="action-note-entry action-note-required">
                <span className="action-note-type-dot" />
                <div className="action-note-body">
                  <span className="action-note-text">{evt.action_detail}</span>
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="action-row-buttons">
          <button
            className="action-row-btn action-row-btn-view"
            onClick={(e) => {
              e.stopPropagation();
              onEventClick && onEventClick(evt);
            }}
          >
            View
          </button>
        </div>
      </div>
    </div>
  );

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
            <div className="actions-list">
              {actionedMessages.map((msg) => renderCompactRow(msg, "actioned"))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
