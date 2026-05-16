import { useEffect, useMemo, useState } from "react";
import "../styles/EventModal.css";

export default function RagScopeModal({
  isOpen,
  message,
  action,
  onConfirm,
  onCancel,
}) {
  const attachments = useMemo(
    () => (message?.attachments || []).filter((a) => !!a),
    [message],
  );

  const [includeMessage, setIncludeMessage] = useState(true);
  const [selectedAttachmentIds, setSelectedAttachmentIds] = useState(
    () => new Set(),
  );
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIncludeMessage(true);
      setSelectedAttachmentIds(new Set(attachments.map((a) => a.id)));
      setSubmitting(false);
    }
  }, [isOpen, attachments]);

  if (!isOpen) return null;

  const actionLabel = action === "remove" ? "Remove from RAG" : "Add to RAG";
  const verb = action === "remove" ? "Remove" : "Index";
  const nothingSelected =
    !includeMessage && selectedAttachmentIds.size === 0;

  function toggleAttachment(id) {
    setSelectedAttachmentIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllAttachments() {
    setSelectedAttachmentIds(new Set(attachments.map((a) => a.id)));
  }

  function clearAllAttachments() {
    setSelectedAttachmentIds(new Set());
  }

  async function handleConfirm() {
    if (nothingSelected || submitting) return;
    setSubmitting(true);
    try {
      await onConfirm({
        includeMessage,
        attachmentIds: Array.from(selectedAttachmentIds),
      });
    } catch (_) {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{actionLabel}</h2>
          <button
            className="modal-close"
            onClick={onCancel}
            aria-label="Close"
            disabled={submitting}
          >
            &times;
          </button>
        </div>

        <div className="event-form">
          <p className="rag-scope-intro">
            Choose what to {verb.toLowerCase()} for RAG search:
          </p>

          <div className="form-group checkbox-group">
            <label htmlFor="rag-scope-message">
              <input
                id="rag-scope-message"
                type="checkbox"
                checked={includeMessage}
                onChange={(e) => setIncludeMessage(e.target.checked)}
                disabled={submitting}
              />
              Message body
              {message?.subject && (
                <span className="rag-scope-detail">
                  &nbsp;— {message.subject}
                </span>
              )}
            </label>
          </div>

          {attachments.length > 0 && (
            <div className="rag-scope-attachments">
              <div className="rag-scope-attachments-header">
                <span>Attachments ({attachments.length})</span>
                <div className="rag-scope-bulk">
                  <button
                    type="button"
                    className="btn-link"
                    onClick={selectAllAttachments}
                    disabled={submitting}
                  >
                    Select all
                  </button>
                  <button
                    type="button"
                    className="btn-link"
                    onClick={clearAllAttachments}
                    disabled={submitting}
                  >
                    Clear
                  </button>
                </div>
              </div>
              <ul className="rag-scope-attachment-list">
                {attachments.map((att) => (
                  <li key={att.id}>
                    <label>
                      <input
                        type="checkbox"
                        checked={selectedAttachmentIds.has(att.id)}
                        onChange={() => toggleAttachment(att.id)}
                        disabled={submitting}
                      />
                      <span className="rag-scope-attachment-name">
                        {att.filename || "(unnamed file)"}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {nothingSelected && (
            <div className="form-error">Select at least one item.</div>
          )}

          <div className="form-buttons">
            <button
              type="button"
              className="btn-cancel"
              onClick={onCancel}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn-submit"
              onClick={handleConfirm}
              disabled={nothingSelected || submitting}
            >
              {submitting ? `${verb}ing...` : verb}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
