import React, { useState, useRef, useEffect } from "react";

// Lightweight confirm modal shared by the "Mark as Actioned" / "Clear" flows
// for calendar events and notes. Pass a `title` (the item's subject) and an
// optional `detail` to pre-fill the closing note.
const MODES = {
  mark_actioned: {
    title: "Mark as Actioned",
    label: "Closing note (optional)",
    placeholder: "e.g. Submitted permission slip",
    confirmText: "Mark as Actioned",
    requiresInput: false,
  },
  clear: {
    title: "Clear action required",
    label: null,
    confirmText: "Clear",
    requiresInput: false,
  },
};

export default function EventActionModal({
  title,
  detail = "",
  mode,
  clearHint = "This removes the action-required flag. The item is not recorded as actioned.",
  onConfirm,
  onCancel,
}) {
  const config = MODES[mode];
  const [note, setNote] = useState(mode === "clear" ? "" : detail || "");
  const inputRef = useRef(null);

  useEffect(() => {
    if (config?.label) inputRef.current?.focus();
  }, [config?.label]);

  if (!config) return null;

  function handleSubmit(e) {
    e.preventDefault();
    if (config.requiresInput && !note.trim()) return;
    onConfirm(note.trim());
  }

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h3>{config.title}</h3>
        <p className="modal-subject">{title}</p>
        <form onSubmit={handleSubmit}>
          {config.label && (
            <div className="form-group">
              <label htmlFor="event-action-note">{config.label}</label>
              <textarea
                id="event-action-note"
                ref={inputRef}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={config.placeholder}
                rows={3}
              />
            </div>
          )}
          {mode === "clear" && <p className="modal-body-text">{clearHint}</p>}
          <div className="modal-actions">
            <button
              type="button"
              className="modal-cancel-btn"
              onClick={onCancel}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="modal-confirm-btn"
              disabled={config.requiresInput && !note.trim()}
            >
              {config.confirmText}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
