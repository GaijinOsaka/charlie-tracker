import React, { useState, useEffect } from "react";
import {
  supabase,
  createManualEvent,
  updateManualEvent,
  deleteManualEvent,
  updateActionStatus,
} from "./lib/supabase";
import { useAuth } from "./lib/AuthContext";
import LoginPage from "./components/LoginPage";
import DocumentBrowser from "./components/DocumentBrowser";
import SettingsPanel from "./components/SettingsPanel";
import CalendarView from "./components/CalendarView";
import ChatDrawer from "./components/ChatDrawer";
import ActionModal from "./components/ActionModal";
import NotificationBell from "./components/NotificationBell";
import { AttachmentViewer } from "./components/AttachmentViewer";
import SetPassword from "./components/SetPassword";
import { Agentation } from "agentation";
import "./App.css";

function linkify(text) {
  if (!text) return text;
  const urlRegex = /(https?:\/\/[^\s<>"{}|\\^`[\]]+)/g;
  const parts = text.split(urlRegex);
  return parts.map((part, i) =>
    /^https?:\/\//.test(part) ? (
      <a
        key={i}
        href={part}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-link"
      >
        {part}
      </a>
    ) : (
      part
    ),
  );
}

function renderMarkdown(text) {
  if (!text) return text;
  const boldRegex = /\*\*([^*]+)\*\*/g;
  const parts = text.split(boldRegex);
  return parts.map((part, i) =>
    i % 2 === 1 ? <strong key={i}>{part}</strong> : part,
  );
}

function App() {
  const {
    user,
    profile,
    loading: authLoading,
    needsPasswordSet,
    signOut,
  } = useAuth();
  const [activeTab, setActiveTab] = useState("messages");
  const [messages, setMessages] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [eventsFilter, setEventsFilter] = useState("upcoming");
  const [eventsTagFilter, setEventsTagFilter] = useState("all");
  const [expandedMessages, setExpandedMessages] = useState(new Set());
  const [expandedEvents, setExpandedEvents] = useState(new Set());
  const [indexingMessages, setIndexingMessages] = useState(new Set());
  const [actionModalMessage, setActionModalMessage] = useState(null);
  const [profiles, setProfiles] = useState({});
  const [viewerAttachment, setViewerAttachment] = useState(null);
  const [viewerOpen, setViewerOpen] = useState(false);

  async function loadProfiles() {
    try {
      const { data } = await supabase.from("profiles").select("*");
      const map = {};
      (data || []).forEach((p) => {
        map[p.id] = p;
      });
      setProfiles(map);
    } catch (err) {
      console.error("Error loading profiles:", err);
    }
  }

  // Load initial data when user is available
  useEffect(() => {
    if (!user) return;
    loadMessages();
    loadEvents();
    loadProfiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Subscribe to realtime updates
  useEffect(() => {
    if (!user) return;

    let channel;
    let isSubscribed = true;

    async function setupSubscription() {
      channel = supabase
        .channel("public:messages")
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "messages",
          },
          (payload) => {
            const newMsg = {
              ...payload.new,
              is_read: false,
              message_read_status: [],
              attachments: [],
            };
            setMessages((prev) => [newMsg, ...prev]);
            addToast(`New message from ${payload.new.sender_name}`, "info");
          },
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "messages",
          },
          (payload) => {
            setMessages((prev) =>
              prev.map((m) => (m.id === payload.new.id ? payload.new : m)),
            );
          },
        )
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "message_deletions",
          },
          (payload) => {
            // Remove messages from UI when user deletes them
            if (payload.new.user_id === user.id) {
              setMessages((prev) =>
                prev.filter((m) => m.id !== payload.new.message_id),
              );
            }
          },
        )
        .subscribe((status) => {
          console.log("Realtime status:", status);
        });
    }

    // Handle app backgrounding/foregrounding on mobile
    function handleVisibilityChange() {
      if (document.hidden) {
        console.log("[Realtime] App backgrounded - unsubscribing");
        isSubscribed = false;
        channel?.unsubscribe();
      } else {
        console.log("[Realtime] App foregrounded - re-subscribing");
        isSubscribed = true;
        setupSubscription();
      }
    }

    setupSubscription();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (isSubscribed && channel) {
        channel.unsubscribe();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function loadMessages() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("messages")
        .select(
          `
          *,
          attachments(id, filename, file_path, mime_type, file_size),
          message_read_status!left(user_id, read_at)
        `,
        )
        .order("received_at", { ascending: false })
        .limit(100);

      if (error) throw error;

      // Filter out soft-deleted messages (messages deleted by this user)
      const { data: deletedIds, error: deleteError } = await supabase
        .from("message_deletions")
        .select("message_id")
        .eq("user_id", user.id);

      if (deleteError) throw deleteError;
      const deletedMessageIds = new Set(
        (deletedIds || []).map((d) => d.message_id),
      );

      const annotated = (data || [])
        .filter((msg) => !deletedMessageIds.has(msg.id))
        .map((msg) => ({
          ...msg,
          is_read: (msg.message_read_status || []).some(
            (rs) => rs.user_id === user.id,
          ),
        }));

      setMessages(annotated);
    } catch (error) {
      setError(error.message);
      console.error("Error loading messages:", error);
    } finally {
      setLoading(false);
    }
  }

  async function loadEvents() {
    try {
      setEventsLoading(true);
      const { data, error } = await supabase
        .from("events")
        .select(
          "*, messages(id, subject, sender_name, sender_email, content, source, received_at, attachments(id, filename, file_path, mime_type, file_size)), documents(id, filename, file_path), event_tags(tag)",
        )
        .order("event_date", { ascending: true });
      if (error) throw error;
      setEvents(data || []);
    } catch (error) {
      console.error("Error loading events:", error);
    } finally {
      setEventsLoading(false);
    }
  }

  function getFilteredEvents() {
    const today = new Date().toISOString().split("T")[0];
    let filtered = events;
    if (eventsFilter === "upcoming") {
      filtered = filtered.filter((e) => e.event_date >= today);
    } else if (eventsFilter === "past") {
      filtered = filtered.filter((e) => e.event_date < today);
    } else if (eventsFilter === "actions") {
      filtered = filtered.filter((e) => e.action_required);
    }
    if (eventsTagFilter !== "all") {
      filtered = filtered.filter(
        (e) =>
          e.event_tags && e.event_tags.some((t) => t.tag === eventsTagFilter),
      );
    }
    return filtered;
  }

  function getAllTags() {
    const tags = new Set();
    events.forEach((e) => {
      if (e.event_tags) e.event_tags.forEach((t) => tags.add(t.tag));
    });
    return Array.from(tags).sort();
  }

  function toggleEventExpanded(eventId) {
    setExpandedEvents((prev) => {
      const next = new Set(prev);
      if (next.has(eventId)) next.delete(eventId);
      else next.add(eventId);
      return next;
    });
  }

  function toggleExpanded(msgId) {
    setExpandedMessages((prev) => {
      const next = new Set(prev);
      if (next.has(msgId)) {
        next.delete(msgId);
      } else {
        next.add(msgId);
        const msg = messages.find((m) => m.id === msgId);
        if (msg && !msg.is_read) {
          setTimeout(() => {
            toggleReadStatus(msg);
          }, 1000);
        }
      }
      return next;
    });
  }

  async function archiveEvent(eventId) {
    try {
      const { error } = await supabase
        .from("event_archives")
        .insert({ event_id: eventId });
      if (error) throw error;
      setEvents((prev) => prev.filter((e) => e.id !== eventId));
      addToast("Event archived", "success");
    } catch (err) {
      console.error("Error archiving event:", err);
      addToast("Failed to archive event", "error");
    }
  }

  async function handleCreateEvent(formData) {
    try {
      const newEvent = await createManualEvent(formData);
      setEvents([...events, newEvent]);
      addToast("Event created successfully", "success");
    } catch (err) {
      console.error("Error creating event:", err);
      addToast("Failed to create event: " + err.message, "error");
    }
  }

  async function handleUpdateEvent(eventId, formData) {
    try {
      const updatedEvent = await updateManualEvent(eventId, formData);
      setEvents(events.map((e) => (e.id === eventId ? updatedEvent : e)));
      addToast("Event updated successfully", "success");
    } catch (err) {
      console.error("Error updating event:", err);
      addToast("Failed to update event: " + err.message, "error");
    }
  }

  async function handleDeleteEvent(eventId) {
    if (!window.confirm("Delete this event?")) return;
    try {
      await deleteManualEvent(eventId);
      setEvents(events.filter((e) => e.id !== eventId));
      addToast("Event deleted", "success");
    } catch (err) {
      console.error("Error deleting event:", err);
      addToast("Failed to delete event: " + err.message, "error");
    }
  }

  async function deleteMessage(msgId) {
    if (
      !window.confirm(
        "Delete this message from your view? (Attachments and events will be preserved)",
      )
    )
      return;
    try {
      // Insert soft delete record - message hidden from this user only
      const { error } = await supabase
        .from("message_deletions")
        .insert({ user_id: user.id, message_id: msgId });

      if (error) throw error;

      // Update local state
      setMessages((prev) => prev.filter((m) => m.id !== msgId));
      addToast("Message deleted from your view", "success");
    } catch (err) {
      console.error("Error deleting message:", err);
      addToast("Failed to delete message", "error");
    }
  }

  function openAttachmentViewer(attachment) {
    setViewerAttachment(attachment);
    setViewerOpen(true);
  }

  async function toggleActionStatus(msg, targetStatus) {
    try {
      await updateActionStatus(msg.id, targetStatus);

      // Update local state optimistically
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msg.id ? { ...m, action_status: targetStatus } : m,
        ),
      );

      const statusLabels = {
        pending: "marked as needing action",
        actioned: "marked as actioned",
        null: "cleared action status",
      };
      addToast(`Message ${statusLabels[targetStatus]}`, "success");
    } catch (err) {
      console.error("Failed to update action status:", err);
      addToast("Failed to update action status", "error");
    }
  }

  async function toggleMessageRag(msg) {
    const action = msg.indexed_for_rag ? "remove" : "index";
    setIndexingMessages((prev) => new Set(prev).add(msg.id));
    try {
      const {
        data: { session: sess },
      } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke("index-message", {
        body: { message_id: msg.id, action },
        headers: sess?.access_token
          ? { Authorization: `Bearer ${sess.access_token}` }
          : {},
      });

      if (error) {
        let errMsg = error.message;
        try {
          if (error.context && typeof error.context.json === "function") {
            const body = await error.context.json();
            errMsg = body.error || errMsg;
          }
        } catch (_) {}
        throw new Error(errMsg);
      }

      if (data?.error) throw new Error(data.error);

      setMessages((prev) =>
        prev.map((m) =>
          m.id === msg.id ? { ...m, indexed_for_rag: action === "index" } : m,
        ),
      );
      addToast(
        action === "index"
          ? `Indexed message${data?.attachments_dispatched ? ` + ${data.attachments_dispatched} attachment(s)` : ""}`
          : "Removed from RAG",
        "success",
      );
    } catch (err) {
      console.error("RAG toggle error:", err);
      addToast(`Failed to ${action} message: ${err.message}`, "error");
    } finally {
      setIndexingMessages((prev) => {
        const next = new Set(prev);
        next.delete(msg.id);
        return next;
      });
    }
  }

  function addToast(message, type = "info") {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }

  function removeToast(id) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  function getFilteredMessages() {
    let filtered = messages;

    if (statusFilter === "unread") {
      filtered = filtered.filter((m) => !m.is_read);
    } else if (statusFilter === "read") {
      filtered = filtered.filter((m) => m.is_read);
    }

    if (sourceFilter !== "all") {
      filtered = filtered.filter((m) => m.source === sourceFilter);
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (m) =>
          m.subject.toLowerCase().includes(query) ||
          (m.sender_name && m.sender_name.toLowerCase().includes(query)) ||
          (m.content && m.content.toLowerCase().includes(query)),
      );
    }

    return filtered;
  }

  async function downloadAttachment(filePath, filename) {
    try {
      const { data, error } = await supabase.storage
        .from("charlie-documents")
        .download(filePath);
      if (error) throw error;
      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename || filePath.split("/").pop();
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Attachment download error:", err);
      addToast("Failed to download attachment", "error");
    }
  }

  async function toggleReadStatus(message) {
    const currentlyRead = message.is_read;
    try {
      if (currentlyRead) {
        await supabase
          .from("message_read_status")
          .delete()
          .eq("user_id", user.id)
          .eq("message_id", message.id);
      } else {
        await supabase
          .from("message_read_status")
          .upsert({ user_id: user.id, message_id: message.id });
      }

      setMessages((prev) =>
        prev.map((m) =>
          m.id === message.id ? { ...m, is_read: !currentlyRead } : m,
        ),
      );
    } catch (err) {
      addToast("Failed to update read status", "error");
    }
  }

  function navigateToMessage(messageId) {
    setActiveTab("messages");
    setExpandedMessages((prev) => new Set([...prev, messageId]));
    setTimeout(() => {
      const el = document.getElementById(`message-${messageId}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
  }

  const filteredMessages = getFilteredMessages();
  const filteredEvents = getFilteredEvents();
  const unreadCount = messages.filter((m) => !m.is_read).length;

  if (authLoading) {
    return <div className="loading-screen">Loading...</div>;
  }

  if (!user) {
    return <LoginPage />;
  }

  if (needsPasswordSet) {
    return <SetPassword />;
  }

  return (
    <div className="app">
      <header>
        <div className="header-top">
          <div>
            <h1>Charlie Oakes Tracker</h1>
            <p className="subtitle">Communication Dashboard</p>
          </div>
          <div className="header-right">
            <NotificationBell onNavigateToMessage={navigateToMessage} />
            <span className="user-name">{profile?.display_name}</span>
            <button className="sign-out-btn" onClick={signOut}>
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <nav className="tab-nav">
        <button
          className={`tab-btn ${activeTab === "messages" ? "active" : ""}`}
          onClick={() => setActiveTab("messages")}
        >
          Messages
          {unreadCount > 0 && <span className="tab-badge">{unreadCount}</span>}
        </button>
        <button
          className={`tab-btn ${activeTab === "events" ? "active" : ""}`}
          onClick={() => setActiveTab("events")}
        >
          Events
        </button>
        <button
          className={`tab-btn ${activeTab === "calendar" ? "active" : ""}`}
          onClick={() => setActiveTab("calendar")}
        >
          Calendar
        </button>
        <button
          className={`tab-btn ${activeTab === "documents" ? "active" : ""}`}
          onClick={() => setActiveTab("documents")}
        >
          Documents
        </button>
        <button
          className={`tab-btn ${activeTab === "settings" ? "active" : ""}`}
          onClick={() => setActiveTab("settings")}
        >
          Settings
        </button>
      </nav>

      <main>
        {activeTab === "events" && (
          <>
            <div className="filters">
              <div className="filter-group">
                <label>Show</label>
                <select
                  value={eventsFilter}
                  onChange={(e) => setEventsFilter(e.target.value)}
                >
                  <option value="upcoming">Upcoming</option>
                  <option value="actions">Action Required</option>
                  <option value="all">All Events</option>
                  <option value="past">Past</option>
                </select>
              </div>
              <div className="filter-group">
                <label>Tag</label>
                <select
                  value={eventsTagFilter}
                  onChange={(e) => setEventsTagFilter(e.target.value)}
                >
                  <option value="all">All Tags</option>
                  {getAllTags().map((tag) => (
                    <option key={tag} value={tag}>
                      {tag}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {eventsLoading && <p className="loading">Loading events...</p>}

            {!eventsLoading && filteredEvents.length === 0 && (
              <p className="no-messages">
                No events found. Events are automatically extracted from school
                emails.
              </p>
            )}

            {!eventsLoading && filteredEvents.length > 0 && (
              <ul className="event-list">
                {filteredEvents.map((evt) => {
                  const today = new Date().toISOString().split("T")[0];
                  const isPast = evt.event_date < today;
                  const isToday = evt.event_date === today;
                  return (
                    <li
                      key={evt.id}
                      className={`event-item ${isPast ? "event-past" : ""} ${isToday ? "event-today" : ""} ${expandedEvents.has(evt.id) ? "event-expanded" : ""}`}
                    >
                      <div
                        className="event-row"
                        onClick={() => toggleEventExpanded(evt.id)}
                      >
                        <div className="event-date-col">
                          <span className="event-day">
                            {new Date(
                              evt.event_date + "T00:00:00",
                            ).toLocaleDateString("en-GB", { day: "numeric" })}
                          </span>
                          <span className="event-month">
                            {new Date(
                              evt.event_date + "T00:00:00",
                            ).toLocaleDateString("en-GB", { month: "short" })}
                          </span>
                          {evt.event_time && (
                            <span className="event-time">
                              {evt.event_time.slice(0, 5)}
                              {evt.event_end_time
                                ? `–${evt.event_end_time.slice(0, 5)}`
                                : ""}
                            </span>
                          )}
                        </div>
                        <div className="event-details">
                          <h4 className="event-title">{evt.title}</h4>
                          {evt.description && (
                            <p className="event-desc">{evt.description}</p>
                          )}
                          <div className="event-meta">
                            {evt.action_required && (
                              <span className="event-action-badge">
                                {evt.action_detail || "Action Required"}
                              </span>
                            )}
                            {isToday && (
                              <span className="event-today-badge">Today</span>
                            )}
                            {evt.event_tags &&
                              evt.event_tags.map((t) => (
                                <span
                                  key={t.tag}
                                  className="event-tag"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEventsTagFilter(t.tag);
                                  }}
                                >
                                  {t.tag}
                                </span>
                              ))}
                            {evt.messages && (
                              <span className="event-source">
                                From:{" "}
                                {evt.messages.sender_name ||
                                  evt.messages.subject}
                              </span>
                            )}
                            {evt.documents && !evt.messages && (
                              <span className="event-source event-document-source">
                                From: {evt.documents.filename}
                              </span>
                            )}
                            <span className="event-expand-hint">
                              {expandedEvents.has(evt.id)
                                ? evt.messages
                                  ? "Hide message ▲"
                                  : "Hide document ▲"
                                : evt.messages
                                  ? "Show message ▼"
                                  : evt.documents
                                    ? "Show document ▼"
                                    : ""}
                            </span>
                          </div>
                        </div>
                        <button
                          className="btn-event-delete"
                          onClick={(e) => {
                            e.stopPropagation();
                            archiveEvent(evt.id);
                          }}
                          title="Archive event"
                        >
                          &times;
                        </button>
                      </div>
                      {expandedEvents.has(evt.id) && evt.messages && (
                        <div className="event-message-panel">
                          <div className="event-message-header">
                            <h4 className="message-subject">
                              {evt.messages.subject}
                            </h4>
                            <div className="event-message-meta-row">
                              <span className="message-sender">
                                {evt.messages.sender_name ||
                                  evt.messages.sender_email}
                              </span>
                              <span className="message-time">
                                {new Date(
                                  evt.messages.received_at,
                                ).toLocaleString()}
                              </span>
                              <span
                                className={`source-badge source-${evt.messages.source}`}
                              >
                                {(evt.messages.source || "arbor").toUpperCase()}
                              </span>
                            </div>
                          </div>
                          <div className="message-content">
                            {linkify(evt.messages.content)}
                          </div>
                          {evt.messages.attachments &&
                            evt.messages.attachments.length > 0 && (
                              <div className="message-attachments">
                                <span className="attachments-label">
                                  Attachments:
                                </span>
                                {evt.messages.attachments.map((att) => (
                                  <button
                                    key={att.id}
                                    className="attachment-link"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openAttachmentViewer(att);
                                    }}
                                    title={att.filename}
                                  >
                                    <span className="attachment-icon">
                                      {att.mime_type?.includes("pdf")
                                        ? "\u{1F4C4}"
                                        : "\u{1F4CE}"}
                                    </span>
                                    <span className="attachment-name">
                                      {att.filename}
                                    </span>
                                    {att.file_size && (
                                      <span className="attachment-size">
                                        ({Math.round(att.file_size / 1024)}KB)
                                      </span>
                                    )}
                                  </button>
                                ))}
                              </div>
                            )}
                        </div>
                      )}
                      {expandedEvents.has(evt.id) &&
                        !evt.messages &&
                        evt.documents && (
                          <div className="event-message-panel">
                            <div className="event-doc-panel">
                              <span className="event-doc-icon">
                                {evt.documents.filename?.endsWith(".pdf")
                                  ? "\u{1F4C4}"
                                  : "\u{1F4CE}"}
                              </span>
                              <div className="event-doc-info">
                                <span className="event-doc-filename">
                                  {evt.documents.filename}
                                </span>
                              </div>
                              <button
                                className="btn-doc-download"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  downloadAttachment(
                                    evt.documents.file_path,
                                    evt.documents.filename,
                                  );
                                }}
                              >
                                Download
                              </button>
                            </div>
                          </div>
                        )}
                      {expandedEvents.has(evt.id) &&
                        !evt.messages &&
                        !evt.documents && (
                          <div className="event-message-panel">
                            <p
                              className="no-messages"
                              style={{ padding: "16px 0" }}
                            >
                              No linked source for this event.
                            </p>
                          </div>
                        )}
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}

        {activeTab === "calendar" && (
          <CalendarView
            events={events}
            linkify={linkify}
            downloadAttachment={downloadAttachment}
            archiveEvent={archiveEvent}
            onCreateEvent={handleCreateEvent}
            onEditEvent={handleUpdateEvent}
            onDeleteEvent={handleDeleteEvent}
            currentUserId={user?.id}
            profiles={profiles}
          />
        )}

        {activeTab === "documents" && <DocumentBrowser />}

        {activeTab === "settings" && <SettingsPanel />}

        {activeTab === "messages" && (
          <>
            <div className="filters">
              <div className="filter-group">
                <label>Status</label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="all">All Messages</option>
                  <option value="unread">Unread</option>
                  <option value="read">Read</option>
                </select>
              </div>

              <div className="filter-group">
                <label>Source</label>
                <select
                  value={sourceFilter}
                  onChange={(e) => setSourceFilter(e.target.value)}
                >
                  <option value="all">All Sources</option>
                  <option value="arbor">Arbor</option>
                  <option value="gmail">Gmail</option>
                </select>
              </div>

              <div className="filter-group search">
                <label>Search</label>
                <input
                  type="text"
                  placeholder="Search messages..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>

            {(() => {
              const actioned = messages
                .filter((m) => m.actioned_at)
                .sort(
                  (a, b) => new Date(b.actioned_at) - new Date(a.actioned_at),
                )
                .slice(0, 5);
              if (actioned.length === 0) return null;
              return (
                <div className="actioned-box">
                  <h4 className="actioned-box-title">Recently Actioned</h4>
                  <ul className="actioned-list">
                    {actioned.map((msg) => (
                      <li key={msg.id} className="actioned-item">
                        <div className="actioned-info">
                          <span className="actioned-subject">
                            {msg.subject}
                          </span>
                          <span className="actioned-meta">
                            {profiles[msg.actioned_by]?.display_name ||
                              msg.actioned_by}{" "}
                            &middot;{" "}
                            {new Date(msg.actioned_at).toLocaleString()}
                          </span>
                          {msg.action_note && (
                            <div className="actioned-note">
                              <span className="actioned-note-label">NOTES</span>
                              <span className="actioned-note-text">
                                {renderMarkdown(msg.action_note)}
                              </span>
                            </div>
                          )}
                        </div>
                        <span
                          className={`source-badge source-${msg.source}`}
                          style={{
                            fontSize: "10px",
                            padding: "2px 6px",
                            flexShrink: 0,
                          }}
                        >
                          {(msg.source || "arbor").toUpperCase()}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })()}

            {loading && <p className="loading">Loading messages...</p>}
            {error && <p className="error">Error: {error}</p>}

            {!loading && !error && filteredMessages.length === 0 && (
              <p className="no-messages">No messages found</p>
            )}

            {!loading && !error && filteredMessages.length > 0 && (
              <ul className="message-list">
                {filteredMessages.map((msg) => (
                  <li
                    key={msg.id}
                    id={`message-${msg.id}`}
                    className={`message-item ${msg.is_read ? "read" : "unread"}`}
                  >
                    <div className="message-header">
                      <div className="message-info">
                        <h3 className="message-subject">{msg.subject}</h3>
                        <p className="message-sender">
                          {msg.sender_name || msg.sender_email}
                        </p>
                        <p className="message-time">
                          {new Date(msg.received_at).toLocaleString()}
                        </p>
                      </div>
                      <div className="message-meta">
                        <span className={`source-badge source-${msg.source}`}>
                          {(msg.source || "arbor").toUpperCase()}
                        </span>
                        {!msg.is_read && <span className="unread-dot"></span>}
                        {msg.actioned_at && (
                          <div className="actioned-info">
                            <span className="actioned-badge">Actioned</span>
                            <span className="actioned-detail">
                              by{" "}
                              {profiles[msg.actioned_by]?.display_name ||
                                "Unknown"}
                              {msg.action_note && (
                                <>
                                  {" — "}
                                  {renderMarkdown(msg.action_note)}
                                </>
                              )}
                            </span>
                          </div>
                        )}
                        {msg.indexed_for_rag && (
                          <span className="indexed-badge">RAG Indexed</span>
                        )}
                      </div>
                    </div>

                    <div
                      className={`message-content ${msg.content && msg.content.length > 200 ? "expandable" : ""}`}
                      onClick={() =>
                        msg.content &&
                        msg.content.length > 200 &&
                        toggleExpanded(msg.id)
                      }
                    >
                      {expandedMessages.has(msg.id) ? (
                        linkify(msg.content)
                      ) : (
                        <>
                          {linkify(msg.content?.substring(0, 200))}
                          {msg.content && msg.content.length > 200 ? "..." : ""}
                        </>
                      )}
                      {msg.content && msg.content.length > 200 && (
                        <span className="expand-toggle">
                          {expandedMessages.has(msg.id)
                            ? "Show less"
                            : "Show more"}
                        </span>
                      )}
                    </div>

                    {msg.attachments && msg.attachments.length > 0 && (
                      <div className="message-attachments">
                        <span className="attachments-label">Attachments:</span>
                        {msg.attachments.map((att) => (
                          <button
                            key={att.id}
                            className="attachment-link"
                            onClick={() => openAttachmentViewer(att)}
                            title={att.filename}
                          >
                            <span className="attachment-icon">
                              {att.mime_type?.includes("pdf")
                                ? "\u{1F4C4}"
                                : "\u{1F4CE}"}
                            </span>
                            <span className="attachment-name">
                              {att.filename}
                            </span>
                            {att.file_size && (
                              <span className="attachment-size">
                                ({Math.round(att.file_size / 1024)}KB)
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                    )}

                    <div className="message-actions">
                      <button
                        className="btn-mark-read"
                        onClick={() => toggleReadStatus(msg)}
                      >
                        {msg.is_read ? "Mark as Unread" : "Mark as Read"}
                      </button>
                      {msg.action_status === null && (
                        <button
                          className="btn-action"
                          onClick={() => toggleActionStatus(msg, "pending")}
                        >
                          ✓ Needs Action
                        </button>
                      )}

                      {msg.action_status === "pending" && (
                        <>
                          <button
                            className="btn-action btn-action-active"
                            onClick={() => toggleActionStatus(msg, null)}
                          >
                            ✓ Needs Action
                          </button>
                          <button
                            className="btn-action btn-action-active"
                            onClick={() => toggleActionStatus(msg, "actioned")}
                          >
                            ✓ Mark Actioned
                          </button>
                        </>
                      )}

                      {msg.action_status === "actioned" && (
                        <button
                          className="btn-action btn-action-active"
                          onClick={() => toggleActionStatus(msg, "pending")}
                        >
                          ✓ Mark Actioned
                        </button>
                      )}
                      <button
                        className={`btn-rag-toggle ${msg.indexed_for_rag ? "btn-rag-remove" : "btn-rag-add"}`}
                        onClick={() => toggleMessageRag(msg)}
                        disabled={indexingMessages.has(msg.id)}
                      >
                        {indexingMessages.has(msg.id)
                          ? msg.indexed_for_rag
                            ? "Removing..."
                            : "Indexing..."
                          : msg.indexed_for_rag
                            ? "Remove from RAG"
                            : "Add to RAG"}
                      </button>
                      <button
                        className="btn-msg-delete"
                        onClick={() => deleteMessage(msg.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </main>

      {/* Toast Container */}
      <div className="toast-container">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast-${toast.type}`}>
            <p>{toast.message}</p>
            <button
              className="toast-close"
              onClick={() => removeToast(toast.id)}
              aria-label="Close"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <ChatDrawer />

      {actionModalMessage && (
        <ActionModal
          message={actionModalMessage}
          onConfirm={confirmAction}
          onCancel={() => setActionModalMessage(null)}
        />
      )}

      <AttachmentViewer
        attachment={viewerAttachment}
        isOpen={viewerOpen}
        onClose={() => setViewerOpen(false)}
      />

      {import.meta.env.DEV && <Agentation />}
    </div>
  );
}

export default App;
