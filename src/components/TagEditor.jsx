import React, { useState } from "react";
import { supabase } from "../lib/supabase";

const AVAILABLE_TAGS = [
  "curriculum",
  "timetable",
  "term-dates",
  "newsletter",
  "policy",
  "safeguarding",
  "health",
  "meals",
  "uniform",
  "clubs",
  "homework",
  "reading",
  "sports",
  "music",
  "trips",
  "parents-evening",
  "report",
  "form",
  "letter",
  "archived",
];

export default function TagEditor({ document, onUpdate }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const currentTags = document.tags || [];

  async function toggleTag(tag) {
    const newTags = currentTags.includes(tag)
      ? currentTags.filter((t) => t !== tag)
      : [...currentTags, tag];

    setSaving(true);
    const { error } = await supabase
      .from("documents")
      .update({ tags: newTags })
      .eq("id", document.id);

    setSaving(false);
    if (!error && onUpdate) {
      onUpdate({ ...document, tags: newTags });
    }
  }

  if (!open) {
    return (
      <button className="btn-edit-tags" onClick={() => setOpen(true)}>
        Edit Tags
      </button>
    );
  }

  return (
    <div className="tag-editor">
      <div className="tag-editor-header">
        <span className="tag-editor-title">Select Tags</span>
        <button className="tag-editor-close" onClick={() => setOpen(false)}>
          Done
        </button>
      </div>
      <div className="tag-editor-grid">
        {AVAILABLE_TAGS.map((tag) => (
          <button
            key={tag}
            className={`tag-option ${currentTags.includes(tag) ? "selected" : ""}`}
            onClick={() => toggleTag(tag)}
            disabled={saving}
          >
            {tag}
          </button>
        ))}
      </div>
    </div>
  );
}

export { AVAILABLE_TAGS };
