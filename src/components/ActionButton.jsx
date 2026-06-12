import React, { useState, useRef, useEffect } from "react";
import { ACTION_STATUS } from "../lib/constants";
import "./ActionButton.css";

export function ActionButton({ message, onStatusChange, onShowActionModal }) {
  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef(null);

  // Close popover when clicking outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  const handleActionClick = (type) => {
    onShowActionModal(message, type);
    setIsOpen(false);
  };

  const handleCancel = () => {
    onStatusChange(message, null);
    setIsOpen(false);
  };

  const status = message.action_status;
  const isRequired = status === ACTION_STATUS.REQUIRED;
  const isActioned = status === ACTION_STATUS.ACTIONED;
  const chipClass = isRequired
    ? "ct-action-chip is-action-required"
    : isActioned
      ? "ct-action-chip is-actioned"
      : "ct-action-chip";
  const chipLabel = isRequired
    ? "Needs action"
    : isActioned
      ? "Actioned"
      : "Action";

  return (
    <div className="action-button-container" ref={popoverRef}>
      <button
        className={chipClass}
        onClick={() => setIsOpen(!isOpen)}
        title="Set action status"
        aria-label="Set action status"
      >
        {isActioned ? "✓" : <span className="ct-action-chip-dot" aria-hidden="true" />}
        {chipLabel}
      </button>

      {isOpen && (
        <div className="action-popover">
          <button
            className="action-option action-option-pending"
            onClick={() => handleActionClick(ACTION_STATUS.REQUIRED)}
          >
            Action Required
          </button>
          <button
            className="action-option action-option-actioned"
            onClick={() => handleActionClick(ACTION_STATUS.ACTIONED)}
          >
            Actioned
          </button>
          {message.action_status && (
            <button
              className="action-option action-option-cancel"
              onClick={handleCancel}
            >
              Clear Status
            </button>
          )}
        </div>
      )}
    </div>
  );
}
