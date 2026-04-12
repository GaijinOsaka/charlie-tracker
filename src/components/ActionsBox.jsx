import React from "react";

export function ActionsBox({
  pendingMessages = [],
  actionedMessages = [],
  onMessageClick = () => {},
}) {
  if (pendingMessages.length === 0 && actionedMessages.length === 0) {
    return null;
  }

  return (
    <div className="actions-box">
      <h4 className="actions-box-title">Actions</h4>

      {pendingMessages.length > 0 && (
        <div className="actions-section">
          <h5 className="actions-section-title">Pending</h5>
          <ul className="actions-list">
            {pendingMessages.map((msg) => (
              <li
                key={msg.id}
                className="actions-item"
                onClick={() => onMessageClick(msg.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    onMessageClick(msg.id);
                  }
                }}
              >
                <div className="actions-info">
                  <span className="actions-subject">{msg.subject}</span>
                  <span className="actions-meta">
                    {(msg.source || "arbor").toUpperCase()} &middot;{" "}
                    {new Date(msg.received_at).toLocaleString()}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {actionedMessages.length > 0 && (
        <div className="actions-section">
          <h5 className="actions-section-title">Actioned</h5>
          <ul className="actions-list">
            {actionedMessages.map((msg) => (
              <li
                key={msg.id}
                className="actions-item"
                onClick={() => onMessageClick(msg.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    onMessageClick(msg.id);
                  }
                }}
              >
                <div className="actions-info">
                  <span className="actions-subject">{msg.subject}</span>
                  <span className="actions-meta">
                    {(msg.source || "arbor").toUpperCase()} &middot;{" "}
                    {new Date(msg.received_at).toLocaleString()}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
