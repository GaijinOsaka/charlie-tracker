import React, { useState, useRef, useEffect } from "react";

export default function ActionModal({ message, type, onConfirm, onCancel }) {
  const [note, setNote] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function handleSubmit(e) {
    e.preventDefault();
    onConfirm(note.trim());
  }

  const isPending = type === "pending";
  const isActioned = type === "actioned";

  const labelText = isPending ? "What action is required?" : "What did you do?";

  const placeholderText = isPending
    ? "e.g. payment needed, Claire to complete"
    : "e.g. Signed and returned the form";

  const buttonText = isPending ? "Mark as Action Required" : "Mark as Actioned";

  const titleText = isPending ? "Action Required" : "Mark as Actioned";

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h3>{titleText}</h3>
        <p className="modal-subject">{message.subject}</p>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="action-note">{labelText}</label>
            <textarea
              id="action-note"
              ref={inputRef}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={placeholderText}
              rows={3}
            />
          </div>
          <div className="modal-actions">
            <button
              type="button"
              className="modal-cancel-btn"
              onClick={onCancel}
            >
              Cancel
            </button>
            <button type="submit" className="modal-confirm-btn">
              {buttonText}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
