import React, { useState, useRef, useEffect } from "react";
import "./ActionButton.css";

export function ActionButton({ message, onStatusChange }) {
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

  const handleActionClick = (status) => {
    onStatusChange(message, status);
    setIsOpen(false);
  };

  const handleClear = () => {
    onStatusChange(message, null);
    setIsOpen(false);
  };

  return (
    <div className="action-button-container" ref={popoverRef}>
      <button
        className="action-button"
        onClick={() => setIsOpen(!isOpen)}
        title="Set action status"
      >
        ⚡
      </button>

      {isOpen && (
        <div className="action-popover">
          <button
            className="action-option action-option-pending"
            onClick={() => handleActionClick("pending")}
          >
            Action Required
          </button>
          <button
            className="action-option action-option-actioned"
            onClick={() => handleActionClick("actioned")}
          >
            Actioned
          </button>
          {message.action_status && (
            <button
              className="action-option action-option-clear"
              onClick={handleClear}
            >
              Clear Status
            </button>
          )}
        </div>
      )}
    </div>
  );
}
