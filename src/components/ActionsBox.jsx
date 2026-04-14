import React, { useState } from "react";
import "./ActionsBox.css";

export function ActionsBox({
  pendingMessages,
  actionedMessages,
  profiles,
  onMessageClick,
  onStatusChange,
  onShowActionModal,
  showRecentlyActioned = false,
}) {
  const [expandedId, setExpandedId] = useState(null);

  // Provide default no-op handlers if not provided
  const handleStatusChange = onStatusChange || (() => {});
  const handleShowActionModal = onShowActionModal || (() => {});

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
          {msg.action_note && (
            <div className="action-row-note">
              {status === "pending" ? "📌" : "✓"} {msg.action_note}
              {status === "actioned" && msg.actioned_by && (
                <span className="action-row-note-meta">
                  — {profiles[msg.actioned_by]?.display_name || "Unknown"}
                  {msg.actioned_at &&
                    ` • ${new Date(msg.actioned_at).toLocaleDateString()}`}
                </span>
              )}
            </div>
          )}
          {msg.attachments && msg.attachments.length > 0 && (
            <div className="action-row-attachments">
              <span className="attachments-label">📎 Attachments:</span>
              <div className="attachments-list">
                {msg.attachments.map((att) => (
                  <span key={att.id} className="attachment-item">
                    {att.mime_type?.includes("pdf") ? "📄" : "📎"}{" "}
                    {att.filename}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="action-row-buttons">
          {status === "pending" && (
            <>
              <button
                className="action-row-btn action-row-btn-action"
                onClick={(e) => {
                  e.stopPropagation();
                  handleShowActionModal(msg, "actioned");
                }}
              >
                Mark as Actioned
              </button>
              <button
                className="action-row-btn action-row-btn-clear"
                onClick={(e) => {
                  e.stopPropagation();
                  handleStatusChange(msg, null);
                }}
              >
                Clear
              </button>
            </>
          )}
          {status === "actioned" && (
            <button
              className="action-row-btn action-row-btn-clear"
              onClick={(e) => {
                e.stopPropagation();
                handleStatusChange(msg, null);
              }}
            >
              Clear
            </button>
          )}
          <button
            className="action-row-btn action-row-btn-view"
            onClick={(e) => {
              e.stopPropagation();
              onMessageClick(msg.id);
            }}
          >
            View Full Message
          </button>
        </div>
      </div>

      {expandedId === msg.id && (
        <div className="action-row-expanded">
          <div className="action-row-content">{msg.content}</div>
          {msg.action_note && (
            <div className="action-row-expanded-note">
              <strong>
                {status === "pending" ? "Action Required:" : "Actioned:"}
              </strong>{" "}
              {msg.action_note}
              {status === "actioned" && (
                <div className="action-row-expanded-meta">
                  {profiles && msg.actioned_by && (
                    <span className="action-row-expanded-by">
                      by {profiles[msg.actioned_by]?.display_name || "Unknown"}
                    </span>
                  )}
                  {msg.actioned_at && (
                    <span className="action-row-expanded-date">
                      {new Date(msg.actioned_at).toLocaleDateString()}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
  if (pendingMessages.length === 0 && actionedMessages.length === 0) {
    return null;
  }

  return (
    <div className="actions-box">
      {pendingMessages.length > 0 && (
        <div className="actions-section">
          <div className="actions-section-title pending">
            ⏳ Action Required ({pendingMessages.length})
          </div>
          <div className="actions-list">
            {pendingMessages.map((msg) => renderCompactRow(msg, "pending"))}
          </div>
        </div>
      )}

      {actionedMessages.length > 0 && (
        <div className="actions-section">
          <div className="actions-section-title actioned">
            ✓ {showRecentlyActioned ? "Recently Actioned" : "Actioned"} (
            {actionedMessages.length})
          </div>
          <div className="actions-list">
            {actionedMessages.map((msg) => renderCompactRow(msg, "actioned"))}
          </div>
        </div>
      )}
    </div>
  );
}
