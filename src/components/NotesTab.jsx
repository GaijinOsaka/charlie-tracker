import { useState } from "react";

export default function NotesTab({
  notes,
  notesLoading,
  profiles,
  onAdd,
  onEdit,
  onDelete,
  onPromote,
  onAddReply,
  onDeleteReply,
  onFlagAction,
  onMarkActioned,
  onClearAction,
  currentUserId,
  onNavigateToCalendar,
}) {
  const [replyingId, setReplyingId] = useState(null);
  const [replyDraft, setReplyDraft] = useState("");
  const [postingReply, setPostingReply] = useState(false);

  function formatDate(iso) {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }

  function formatReplyDate(iso) {
    const d = new Date(iso);
    return `${d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  }

  function formatEventDate(dateStr) {
    return new Date(dateStr + "T00:00:00").toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }

  function truncate(text, max = 120) {
    if (!text) return "";
    return text.length > max ? text.slice(0, max) + "…" : text;
  }

  function openReply(noteId) {
    setReplyingId(noteId);
    setReplyDraft("");
  }

  function cancelReply() {
    setReplyingId(null);
    setReplyDraft("");
  }

  async function postReply(noteId) {
    if (!onAddReply) return;
    const body = replyDraft.trim();
    if (!body) return;
    try {
      setPostingReply(true);
      await onAddReply(noteId, body);
      setReplyingId(null);
      setReplyDraft("");
    } finally {
      setPostingReply(false);
    }
  }

  function sortReplies(replies) {
    return [...(replies || [])].sort(
      (a, b) => new Date(a.created_at) - new Date(b.created_at),
    );
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
            const replies = sortReplies(note.note_replies);
            const isReplying = replyingId === note.id;
            return (
              <li key={note.id} className="note-card">
                <div className="note-card-header">
                  <h4 className="note-title">{note.title}</h4>
                  {note.action_required && (
                    <span className="note-action-badge required">
                      Action required
                    </span>
                  )}
                  {note.actioned_at && (
                    <span className="note-action-badge actioned">Actioned</span>
                  )}
                  {note.event_id && (
                    <button
                      className="note-calendar-badge"
                      onClick={onNavigateToCalendar}
                      title="View in Calendar"
                    >
                      {note.events?.event_date
                        ? formatEventDate(note.events.event_date)
                        : "In Calendar"}
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

                {replies.length > 0 && (
                  <ul className="note-replies">
                    {replies.map((r) => {
                      const replyAuthor =
                        profiles[r.author_id]?.display_name || "Unknown";
                      const canDelete =
                        currentUserId && r.author_id === currentUserId;
                      return (
                        <li key={r.id} className="note-reply">
                          <p className="note-reply-body">{r.body}</p>
                          <div className="note-reply-meta">
                            <span className="note-reply-author">
                              {replyAuthor}
                            </span>
                            <span className="note-reply-date">
                              {formatReplyDate(r.created_at)}
                            </span>
                            {canDelete && onDeleteReply && (
                              <button
                                className="btn-note-reply-delete"
                                onClick={() => onDeleteReply(note.id, r.id)}
                              >
                                Delete
                              </button>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}

                {isReplying && (
                  <div className="note-reply-composer">
                    <textarea
                      className="note-reply-input"
                      placeholder="Add a reply…"
                      value={replyDraft}
                      onChange={(e) => setReplyDraft(e.target.value)}
                      rows={2}
                      autoFocus
                    />
                    <div className="note-reply-composer-actions">
                      <button
                        className="btn-note-reply-cancel"
                        onClick={cancelReply}
                        disabled={postingReply}
                      >
                        Cancel
                      </button>
                      <button
                        className="btn-note-reply-post"
                        onClick={() => postReply(note.id)}
                        disabled={postingReply || !replyDraft.trim()}
                      >
                        Post
                      </button>
                    </div>
                  </div>
                )}

                <div className="note-actions">
                  <button className="btn-note-edit" onClick={() => onEdit(note)}>
                    Edit
                  </button>
                  <button className="btn-note-delete" onClick={() => onDelete(note.id)}>
                    Delete
                  </button>
                  {onAddReply && !isReplying && (
                    <button
                      className="btn-note-reply"
                      onClick={() => openReply(note.id)}
                    >
                      Reply
                    </button>
                  )}
                  {!note.event_id && (
                    <button className="btn-note-promote" onClick={() => onPromote(note)}>
                      Add to Calendar
                    </button>
                  )}
                  {note.action_required && onMarkActioned && (
                    <button
                      className="btn-note-action"
                      onClick={() => onMarkActioned(note)}
                    >
                      Mark Actioned
                    </button>
                  )}
                  {(note.action_required || note.actioned_at) && onClearAction && (
                    <button
                      className="btn-note-clear"
                      onClick={() => onClearAction(note)}
                    >
                      Clear Action
                    </button>
                  )}
                  {!note.action_required && !note.actioned_at && onFlagAction && (
                    <button
                      className="btn-note-flag"
                      onClick={() => onFlagAction(note)}
                    >
                      Flag Action
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
