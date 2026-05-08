export default function NotesTab({
  notes,
  notesLoading,
  profiles,
  onAdd,
  onEdit,
  onDelete,
  onPromote,
  onNavigateToCalendar,
}) {
  function formatDate(iso) {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }

  function truncate(text, max = 120) {
    if (!text) return "";
    return text.length > max ? text.slice(0, max) + "…" : text;
  }

  return (
    <div className="notes-tab">
      <div className="notes-header">
        <button className="btn-add-note" onClick={onAdd}>
          + Add Note
        </button>
      </div>

      {notesLoading && (
        <div className="skeleton-list">
          {[1, 2, 3].map((n) => (
            <div key={n} className="skeleton-item">
              <div className="skeleton-line skeleton-subject" />
              <div className="skeleton-line skeleton-sender" />
              <div className="skeleton-line skeleton-body-short" />
            </div>
          ))}
        </div>
      )}

      {!notesLoading && notes.length === 0 && (
        <p className="no-messages">No notes yet. Tap + Add Note to create one.</p>
      )}

      {!notesLoading && notes.length > 0 && (
        <ul className="note-list">
          {notes.map((note) => {
            const author = profiles[note.author_id];
            const authorName = author?.display_name || "Unknown";
            return (
              <li key={note.id} className="note-card">
                <div className="note-card-header">
                  <h4 className="note-title">{note.title}</h4>
                  {note.event_id && (
                    <button
                      className="note-calendar-badge"
                      onClick={onNavigateToCalendar}
                      title="View in Calendar"
                    >
                      In Calendar
                    </button>
                  )}
                </div>

                {note.body && (
                  <p className="note-body">{truncate(note.body)}</p>
                )}

                <div className="note-meta">
                  <span className="note-author">{authorName}</span>
                  <span className="note-date">{formatDate(note.created_at)}</span>
                </div>

                <div className="note-actions">
                  <button className="btn-note-edit" onClick={() => onEdit(note)}>
                    Edit
                  </button>
                  <button className="btn-note-delete" onClick={() => onDelete(note.id)}>
                    Delete
                  </button>
                  {!note.event_id && (
                    <button className="btn-note-promote" onClick={() => onPromote(note)}>
                      Add to Calendar
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
