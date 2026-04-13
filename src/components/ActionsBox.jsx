import React, { useState } from "react";
import "./ActionsBox.css";

export function ActionsBox({ pendingMessages, actionedMessages, onMessageClick }) {
  const [expandedId, setExpandedId] = useState(null);

  const renderCompactRow = (msg, status) => (
    <div
      key={msg.id}
      className={`action-row action-row-${status}`}
      onClick={() =>
        setExpandedId(expandedId === msg.id ? null : msg.id)
      }
    >
      <div className="action-row-header">
        <div className="action-row-status-dot" />
        <div className="action-row-info">
          <div className="action-row-subject">{msg.subject || "(No subject)"}</div>
          <div className="action-row-meta">
            <span className="action-row-source">{msg.source}</span>
            <span className="action-row-date">
              {new Date(msg.received_at).toLocaleDateString()}
            </span>
          </div>
        </div>
      </div>

      {expandedId === msg.id && (
        <div className="action-row-expanded">
          <div className="action-row-content">{msg.content}</div>
          <button
            className="action-row-view-btn"
            onClick={(e) => {
              e.stopPropagation();
              onMessageClick(msg.id);
            }}
          >
            View Full Message
          </button>
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
            ✓ Actioned ({actionedMessages.length})
          </div>
          <div className="actions-list">
            {actionedMessages.map((msg) => renderCompactRow(msg, "actioned"))}
          </div>
        </div>
      )}
    </div>
  );
}
