import React, { useState, useEffect, useMemo, useRef } from "react";
import { ACTION_STATUS } from "./lib/constants";
import {
  supabase,
  createManualEvent,
  updateManualEvent,
  deleteManualEvent,
  updateActionStatus,
  triggerPushNotifications,
} from "./lib/supabase";
import { useAuth } from "./lib/AuthContext";
import LoginPage from "./components/LoginPage";
import DocumentBrowser from "./components/DocumentBrowser";
import SettingsPanel from "./components/SettingsPanel";
import CalendarView from "./components/CalendarView";
import ChatDrawer from "./components/ChatDrawer";
import NotificationBell from "./components/NotificationBell";
import { AttachmentViewer } from "./components/AttachmentViewer";
import SetPassword from "./components/SetPassword";
import { ActionsBox } from "./components/ActionsBox";
import { ActionButton } from "./components/ActionButton";
import ActionModal from "./components/ActionModal";
import NoteModal from "./components/NoteModal";
import NotesTab from "./components/NotesTab";
import EventModal from "./components/EventModal";
import { Agentation } from "agentation";
import { getPaginatedMessages, calculateTotalPages } from "./lib/pagination";
import "./App.css";

async function subscribeToPushNotifications(user) {
  if (!("Notification" in window) || !navigator.serviceWorker) {
    return;
  }

  // Validate VAPID key is configured
  const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY?.trim();
  if (!vapidKey) {
    console.warn(
      "VITE_VAPID_PUBLIC_KEY is not configured. Push notifications disabled.",
    );
    return;
  }

  try {
    // Get permission if not already granted
    if (Notification.permission === "default") {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        return;
      }
    }

    // If user denied permission, abort
    if (Notification.permission !== "granted") {
      return;
    }

    // Get service worker registration
    const registration = await navigator.serviceWorker.ready;

    if (!registration.pushManager) {
      return;
    }

    // Unsubscribe existing subscription if VAPID key changed
    const existingSub = await registration.pushManager.getSubscription();
    if (existingSub) {
      await existingSub.unsubscribe();
    }

    // Subscribe to push
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey),
    });

    // Send subscription to Supabase
    const { error } = await supabase.from("push_subscriptions").upsert(
      {
        user_id: user.id,
        subscription: subscription.toJSON(),
        device_name: `${getBrowserName()} ${new Date().toLocaleDateString()}`,
      },
      { onConflict: "user_id,subscription" },
    );

    if (error) {
      console.error("Failed to save subscription:", error);
    }
  } catch (error) {
    console.error("Failed to subscribe to push:", error);
  }
}

// Helper function to convert VAPID key from URL-safe base64 to Uint8Array
function urlBase64ToUint8Array(base64String) {
  if (typeof base64String !== "string" || !base64String) {
    throw new Error("VAPID key must be a non-empty string");
  }

  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, "+")
    .replace(/_/g, "/");

  try {
    const rawData = window.atob(base64);
    return new Uint8Array([...rawData].map((char) => char.charCodeAt(0)));
  } catch (error) {
    throw new Error(`Failed to decode VAPID key: ${error.message}`);
  }
}

// Helper function to extract browser name from user agent
function getBrowserName() {
  const ua = navigator.userAgent;
  if (ua.includes("Chrome") && !ua.includes("Chromium")) {
    return "Chrome";
  } else if (ua.includes("Safari") && !ua.includes("Chrome")) {
    return "Safari";
  } else if (ua.includes("Firefox")) {
    return "Firefox";
  } else if (ua.includes("Edge") || ua.includes("Edg")) {
    return "Edge";
  } else if (ua.includes("Chromium")) {
    return "Chromium";
  }
  return "Unknown";
}

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
  const [calendarFocusDate, setCalendarFocusDate] = useState(null);
  const [messages, setMessages] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [eventsFilter, setEventsFilter] = useState("upcoming");
  const [eventsTagFilter, setEventsTagFilter] = useState("all");
  const [expandedMessages, setExpandedMessages] = useState(new Set());
  const [expandedEvents, setExpandedEvents] = useState(new Set());
  const [expandedActionMessageId, setExpandedActionMessageId] = useState(null);
  const [indexingMessages, setIndexingMessages] = useState(new Set());
  const [profiles, setProfiles] = useState({});
  const [viewerAttachment, setViewerAttachment] = useState(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [actionModalOpen, setActionModalOpen] = useState(false);
  const [actionModalMessage, setActionModalMessage] = useState(null);
  const [actionModalType, setActionModalType] = useState(null);
  const [categories, setCategories] = useState([]);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [notes, setNotes] = useState([]);
  const [notesLoading, setNotesLoading] = useState(true);
  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [editingNote, setEditingNote] = useState(null);
  const [promoteNote, setPromoteNote] = useState(null);
  const [editingNoteEvent, setEditingNoteEvent] = useState(null);
  const lastLoadedAt = useRef(null);
  const loadRetryTimer = useRef(null);
  const loadRetryCount = useRef(0);

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

  async function loadCategories() {
    try {
      const { data } = await supabase
        .from("categories")
        .select("id, name, color")
        .order("name");
      setCategories(data || []);
    } catch (err) {
      console.error("Error loading categories:", err);
    }
  }

  async function loadNotes() {
    try {
      setNotesLoading(true);
      const { data, error } = await supabase
        .from("notes")
        .select("id, title, body, author_id, event_id, created_at, updated_at, events!event_id(id, event_date, title)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setNotes(data || []);
    } catch (err) {
      console.error("Error loading notes:", err);
    } finally {
      setNotesLoading(false);
    }
  }

  // Load initial data when user is available
  useEffect(() => {
    if (!user) return;
    loadRetryCount.current = 0;
    loadMessages();
    loadEvents();
    loadProfiles();
    loadCategories();
    loadNotes();
    return () => {
      clearTimeout(loadRetryTimer.current);
      loadRetryTimer.current = null;
      loadRetryCount.current = 0;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Subscribe to push notifications when user authenticates
  useEffect(() => {
    if (user) {
      subscribeToPushNotifications(user);
    }
  }, [user]);

  // Handle navigation from push notification clicks
  useEffect(() => {
    if (!navigator.serviceWorker) return;

    // Listen for navigation messages from service worker
    const handleMessage = (event) => {
      try {
        if (
          event.data?.type === "NAVIGATE_TO_MESSAGE" &&
          event.data?.messageId != null
        ) {
          setExpandedMessages(new Set([event.data.messageId]));
          setActionModalOpen(false);

          // Scroll to the message after DOM updates
          setTimeout(() => {
            try {
              const messageElement = document.getElementById(
                `message-${event.data.messageId}`,
              );
              if (messageElement) {
                messageElement.scrollIntoView({
                  behavior: "smooth",
                  block: "nearest",
                });
              } else {
                console.warn(
                  `Message element not found: message-${event.data.messageId}`,
                );
              }
            } catch (scrollError) {
              console.error("Error scrolling to message:", scrollError);
            }
          }, 100);
        }
      } catch (error) {
        console.error("Error handling push notification navigation:", error);
      }
    };

    navigator.serviceWorker.addEventListener("message", handleMessage);
    return () => {
      navigator.serviceWorker.removeEventListener("message", handleMessage);
    };
  }, []);

  // Subscribe to realtime updates
  useEffect(() => {
    if (!user) return;

    let channel;
    let retryTimeout;

    function cleanupChannel() {
      if (channel) {
        supabase.removeChannel(channel);
        channel = null;
      }
    }

    function setupSubscription() {
      cleanupChannel();

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
              prev.map((m) =>
                m.id === payload.new.id ? { ...m, ...payload.new } : m,
              ),
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
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "attachments",
          },
          (payload) => {
            // When a new attachment is added, update the message with it
            const newAttachment = payload.new;
            setMessages((prev) =>
              prev.map((m) => {
                if (m.id === newAttachment.message_id) {
                  return {
                    ...m,
                    attachments: [...(m.attachments || []), newAttachment],
                  };
                }
                return m;
              }),
            );
          },
        )
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "notes" },
          (payload) => {
            setNotes((prev) => [payload.new, ...prev]);
          },
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "notes" },
          (payload) => {
            setNotes((prev) =>
              prev.map((n) => (n.id === payload.new.id ? { ...n, ...payload.new } : n)),
            );
          },
        )
        .on(
          "postgres_changes",
          { event: "DELETE", schema: "public", table: "notes" },
          (payload) => {
            setNotes((prev) => prev.filter((n) => n.id !== payload.old.id));
          },
        )
        .subscribe((status) => {
          if (import.meta.env.DEV) console.log("[Realtime] Status:", status);
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            console.warn("[Realtime] Connection lost, retrying in 5s...");
            clearTimeout(retryTimeout);
            retryTimeout = setTimeout(() => {
              setupSubscription();
              loadMessages();
            }, 5000);
          }
        });
    }

    // Reload data + reconnect when app comes back to foreground or network recovers
    const STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
    function handleResume(forceReload = false) {
      if (import.meta.env.DEV)
        console.log("[Realtime] Resuming — refreshing data and reconnecting");
      const isStale =
        forceReload ||
        !lastLoadedAt.current ||
        Date.now() - lastLoadedAt.current > STALE_THRESHOLD_MS;
      if (isStale) {
        loadMessages();
        loadEvents();
        loadNotes();
      }
      setupSubscription();
    }

    function handleVisibilityChange() {
      if (!document.hidden) {
        handleResume();
      }
    }

    function handleOnline() {
      handleResume(true); // network restored → always reload
    }

    setupSubscription();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("online", handleOnline);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("online", handleOnline);
      clearTimeout(retryTimeout);
      cleanupChannel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter, sourceFilter, actionFilter, searchQuery, categoryFilter]);

  async function loadMessages() {
    let retrying = false;
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("messages")
        .select(
          `
          id,
          source_message_id,
          source,
          subject,
          content,
          sender_name,
          sender_email,
          received_at,
          category_id,
          categories(id, name, color),
          action_status,
          actioned_at,
          actioned_by,
          action_note,
          indexed_for_rag,
          created_at,
          updated_at,
          attachments(id, filename, file_path, mime_type, file_size),
          message_read_status!left(user_id, read_at),
          action_notes(id, user_id, note, action_type, created_at)
        `,
        )
        .order("received_at", { ascending: false })
        .limit(500);

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
      lastLoadedAt.current = Date.now();
      loadRetryCount.current = 0;
      if (loadRetryTimer.current) {
        clearTimeout(loadRetryTimer.current);
        loadRetryTimer.current = null;
      }
    } catch (error) {
      console.error("Error loading messages:", error);
      const hadPreviousData = !!lastLoadedAt.current;
      if (!hadPreviousData) {
        if (!loadRetryTimer.current) {
          // First load failed — retry up to 3 times (2s, 5s, 10s)
          const MAX_RETRIES = 3;
          const delays = [2000, 5000, 10000];
          if (loadRetryCount.current < MAX_RETRIES) {
            const delay = delays[loadRetryCount.current];
            loadRetryCount.current += 1;
            loadRetryTimer.current = setTimeout(() => {
              loadRetryTimer.current = null;
              loadMessages();
            }, delay);
          } else {
            // All retries exhausted with no data
            setError("Couldn't load messages. Pull down to retry.");
          }
        }
        // Keep skeleton visible as long as any retry is pending —
        // a concurrent call may have already set the timer, so check the ref
        // rather than assuming this call was the one that set it.
        retrying = !!loadRetryTimer.current;
      }
      // If hadPreviousData: silently fail — old messages remain visible
    } finally {
      if (!retrying) {
        setLoading(false);
      }
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

  const filteredEvents = useMemo(() => {
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
  }, [events, eventsFilter, eventsTagFilter]);

  const allTags = useMemo(() => {
    const tags = new Set();
    events.forEach((e) => {
      if (e.event_tags) e.event_tags.forEach((t) => tags.add(t.tag));
    });
    return Array.from(tags).sort();
  }, [events]);

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
      if (import.meta.env.DEV)
        console.log("Archiving event:", eventId, "for user:", user?.id);
      const { error } = await supabase
        .from("event_archives")
        .upsert(
          { user_id: user.id, event_id: eventId },
          { onConflict: "user_id,event_id" },
        );
      if (error) {
        console.error("Supabase error:", error.message, error);
        throw error;
      }
      setEvents((prev) => prev.filter((e) => e.id !== eventId));
      addToast("Event archived", "success");
    } catch (err) {
      console.error("Error archiving event:", err.message || err);
      addToast(
        "Failed to archive event: " + (err.message || "Unknown error"),
        "error",
      );
    }
  }

  async function handleCreateEvent(formData) {
    try {
      await createManualEvent(formData);
      await loadEvents();
      addToast("Event created successfully", "success");
    } catch (err) {
      console.error("Error creating event:", err);
      addToast("Failed to create event: " + err.message, "error");
    }
  }

  async function handleUpdateEvent(eventId, formData) {
    try {
      await updateManualEvent(eventId, formData);
      await loadEvents();
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

  function handleAddNote() {
    setEditingNote(null);
    setNoteModalOpen(true);
  }

  function handleEditNote(note) {
    if (note.event_id) {
      const linkedEvent = events.find((e) => e.id === note.event_id) || { id: note.event_id };
      setEditingNoteEvent({ note, event: linkedEvent });
    } else {
      setEditingNote(note);
      setNoteModalOpen(true);
    }
  }

  async function handleDeleteNote(noteId) {
    if (!window.confirm("Delete this note?")) return;
    try {
      const { error } = await supabase.from("notes").delete().eq("id", noteId);
      if (error) throw error;
      setNotes((prev) => prev.filter((n) => n.id !== noteId));
      addToast("Note deleted", "success");
    } catch (err) {
      console.error("Error deleting note:", err);
      addToast("Failed to delete note", "error");
    }
  }

  function handlePromoteNote(note) {
    setPromoteNote(note);
  }

  async function handlePromoteNoteSave(formData) {
    try {
      const newEvent = await createManualEvent(formData);
      const { error } = await supabase
        .from("notes")
        .update({ event_id: newEvent.id })
        .eq("id", promoteNote.id);
      if (error) throw error;
      setNotes((prev) =>
        prev.map((n) =>
          n.id === promoteNote.id
            ? { ...n, event_id: newEvent.id, events: { id: newEvent.id, event_date: newEvent.event_date, title: newEvent.title } }
            : n,
        ),
      );
      setPromoteNote(null);
      await loadEvents();
      setCalendarFocusDate(newEvent.event_date);
      setActiveTab("calendar");
      addToast("Event created and note linked", "success");
    } catch (err) {
      console.error("Error promoting note:", err);
      addToast("Failed to create event: " + err.message, "error");
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

      // Clear any action status so it doesn't linger in the other user's Actions view
      const msg = messages.find((m) => m.id === msgId);
      if (msg && msg.action_status) {
        await updateActionStatus(msgId, null, null);
      }

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

  async function toggleActionStatus(msg, targetStatus, note = null) {
    try {
      const previousStatus = msg.action_status;
      await updateActionStatus(msg.id, targetStatus, note);

      // Update local state optimistically
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msg.id
            ? { ...m, action_status: targetStatus, action_note: note }
            : m,
        ),
      );

      // Trigger push notifications if status changed to action_required
      if (
        targetStatus === ACTION_STATUS.REQUIRED &&
        previousStatus !== ACTION_STATUS.REQUIRED
      ) {
        await triggerPushNotifications(
          { ...msg, action_status: targetStatus, action_note: note },
          previousStatus,
        );
      }

      const statusLabels = {
        [ACTION_STATUS.REQUIRED]: "marked as action required",
        [ACTION_STATUS.ACTIONED]: "marked as actioned",
        null: "cleared action status",
      };
      addToast(`Message ${statusLabels[targetStatus]}`, "success");
    } catch (err) {
      console.error("Failed to update action status:", err);
      addToast("Failed to update action status", "error");
    }
  }

  function handleShowActionModal(message, type) {
    setActionModalMessage(message);
    setActionModalType(type);
    setActionModalOpen(true);
  }

  async function handleActionModalConfirm(note) {
    if (actionModalMessage && actionModalType) {
      // Insert note into action_notes table
      if (note && note.trim()) {
        const { error: noteError } = await supabase
          .from("action_notes")
          .insert({
            message_id: actionModalMessage.id,
            user_id: user.id,
            note: note.trim(),
            action_type: actionModalType,
          });
        if (noteError) {
          console.error("Failed to insert action note:", noteError);
        } else {
          // Add the new note to local state
          const newNote = {
            id: crypto.randomUUID(),
            user_id: user.id,
            note: note.trim(),
            action_type: actionModalType,
            created_at: new Date().toISOString(),
          };
          setMessages((prev) =>
            prev.map((m) =>
              m.id === actionModalMessage.id
                ? {
                    ...m,
                    action_notes: [...(m.action_notes || []), newNote],
                  }
                : m,
            ),
          );
        }
      }

      // Update message action status (keep action_note for backward compat)
      const userName =
        profiles[user?.id]?.display_name || user?.email || "Unknown";
      const now = new Date();
      const formattedDate = now.toLocaleDateString();
      const formattedTime = now.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
      const noteWithMetadata = note
        ? `${note} — ${userName} • ${formattedDate} ${formattedTime}`
        : "";
      await toggleActionStatus(actionModalMessage, actionModalType, noteWithMetadata);
      if (actionModalType === ACTION_STATUS.REQUIRED) {
        addToast("Moved to Action Required — check the Actions tab", "info");
      }
    }
    setActionModalOpen(false);
  }

  function handleActionModalCancel() {
    setActionModalOpen(false);
    setActionModalMessage(null);
    setActionModalType(null);
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

  const filteredMessages = useMemo(() => {
    let filtered = messages;

    if (statusFilter === "unread") {
      filtered = filtered.filter((m) => !m.is_read);
    } else if (statusFilter === "read") {
      filtered = filtered.filter((m) => m.is_read);
    }

    if (sourceFilter !== "all") {
      filtered = filtered.filter((m) => m.source === sourceFilter);
    }

    if (actionFilter === "pending") {
      filtered = filtered.filter(
        (m) =>
          m.action_status === ACTION_STATUS.REQUIRED ||
          m.action_status === "pending",
      );
    } else if (actionFilter === "actioned") {
      filtered = filtered.filter(
        (m) => m.action_status === ACTION_STATUS.ACTIONED,
      );
    } else {
      // Default view: exclude messages that have an action status
      // (they appear in the ActionsBox above)
      filtered = filtered.filter(
        (m) =>
          !m.action_status ||
          (m.action_status !== ACTION_STATUS.REQUIRED &&
            m.action_status !== "pending" &&
            m.action_status !== ACTION_STATUS.ACTIONED),
      );
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

    if (categoryFilter !== "all") {
      filtered = filtered.filter((m) => m.category_id === categoryFilter);
    }

    return filtered;
  }, [messages, statusFilter, sourceFilter, actionFilter, searchQuery, categoryFilter]);

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

  const totalPages = useMemo(
    () => calculateTotalPages(filteredMessages.length),
    [filteredMessages.length],
  );
  const paginatedMessages = useMemo(
    () => getPaginatedMessages(filteredMessages, currentPage),
    [filteredMessages, currentPage],
  );
  const unreadCount = useMemo(
    () => messages.filter((m) => !m.is_read).length,
    [messages],
  );

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
          <div className="header-brand">
            <div className="brand-mark">C</div>
            <div>
              <h1>Charlie Oakes Tracker</h1>
              <p className="subtitle">Communication Dashboard</p>
            </div>
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
          className={`tab-btn ${activeTab === "actions" ? "active" : ""}`}
          onClick={() => setActiveTab("actions")}
        >
          Actions
        </button>
        <button
          className={`tab-btn ${activeTab === "notes" ? "active" : ""}`}
          onClick={() => setActiveTab("notes")}
        >
          Notes
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
                  {allTags.map((tag) => (
                    <option key={tag} value={tag}>
                      {tag}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {eventsLoading && (
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
                                    <span
                                      className="attachment-icon"
                                      aria-hidden="true"
                                    >
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
            initialDate={calendarFocusDate}
          />
        )}

        {activeTab === "documents" && <DocumentBrowser />}

        {activeTab === "actions" && (
          <ActionsBox
            pendingMessages={messages
              .filter((m) => m.action_status === ACTION_STATUS.REQUIRED)
              .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))}
            actionedMessages={messages
              .filter((m) => m.action_status === ACTION_STATUS.ACTIONED)
              .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))}
            profiles={profiles}
            onMessageClick={(msgId) => {
              setExpandedMessages(new Set([...expandedMessages, msgId]));
              setActiveTab("messages");
              navigateToMessage(msgId);
            }}
            onStatusChange={toggleActionStatus}
            onShowActionModal={handleShowActionModal}
            onAttachmentClick={openAttachmentViewer}
          />
        )}

        {activeTab === "notes" && (
          <NotesTab
            notes={notes}
            notesLoading={notesLoading}
            profiles={profiles}
            onAdd={handleAddNote}
            onEdit={handleEditNote}
            onDelete={handleDeleteNote}
            onPromote={handlePromoteNote}
            onNavigateToCalendar={() => setActiveTab("calendar")}
          />
        )}

        {activeTab === "settings" && <SettingsPanel />}

        {activeTab === "messages" && (
          <>
            <div className="filters">
              <div className="filter-group search">
                <label>Search</label>
                <input
                  type="text"
                  placeholder="Search messages..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

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

              <div className="filter-group">
                <label>Action</label>
                <select
                  value={actionFilter}
                  onChange={(e) => setActionFilter(e.target.value)}
                >
                  <option value="all">All Messages</option>
                  <option value="pending">Needs Action</option>
                  <option value="actioned">Actioned</option>
                </select>
              </div>

              {categories.length > 0 && (
                <div className="filter-group">
                  <label>Category</label>
                  <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                  >
                    <option value="all">All Categories</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {(() => {
              const actionsPending = messages
                .filter(
                  (m) =>
                    m.action_status === ACTION_STATUS.REQUIRED ||
                    m.action_status === "pending",
                )
                .sort(
                  (a, b) => new Date(b.updated_at) - new Date(a.updated_at),
                );

              const actionsCompleted = messages
                .filter((m) => m.action_status === ACTION_STATUS.ACTIONED)
                .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
                .slice(0, 3);

              return (
                <ActionsBox
                  pendingMessages={actionsPending}
                  actionedMessages={actionsCompleted}
                  profiles={profiles}
                  showRecentlyActioned={true}
                  onMessageClick={(msgId) => {
                    setExpandedMessages(new Set([...expandedMessages, msgId]));
                  }}
                  onStatusChange={toggleActionStatus}
                  onShowActionModal={handleShowActionModal}
                  onAttachmentClick={openAttachmentViewer}
                />
              );
            })()}

            {loading && (
              <div className="skeleton-list">
                {[1, 2, 3, 4, 5].map((n) => (
                  <div key={n} className="skeleton-item">
                    <div className="skeleton-line skeleton-subject" />
                    <div className="skeleton-line skeleton-sender" />
                    <div className="skeleton-line skeleton-body" />
                    <div className="skeleton-line skeleton-body-short" />
                  </div>
                ))}
              </div>
            )}
            {error && <p className="error">Error: {error}</p>}

            {!loading && !error && filteredMessages.length === 0 && (
              <p className="no-messages">No messages found</p>
            )}

            {!loading && !error && filteredMessages.length > 0 && (
              <>
                <ul className="message-list">
                  {paginatedMessages.map((msg) => (
                    <li
                      key={msg.id}
                      id={`message-${msg.id}`}
                      className={`message-item ${msg.is_read ? "read" : "unread"}`}
                    >
                      <div className="message-header">
                        <div className="message-top-row">
                          {!msg.is_read && <span className="unread-dot"></span>}
                          <span className="message-sender">
                            {msg.sender_name || msg.sender_email}
                          </span>
                          <span className="message-source-sep" aria-hidden="true">·</span>
                          <span className={`source-badge source-${msg.source}`}>
                            {(msg.source || "arbor").toUpperCase()}
                          </span>
                          {msg.categories && (
                            <span
                              className="category-badge"
                              style={{ backgroundColor: msg.categories.color }}
                            >
                              {msg.categories.name}
                            </span>
                          )}
                          <ActionButton
                            message={msg}
                            onStatusChange={toggleActionStatus}
                            onShowActionModal={handleShowActionModal}
                          />
                          {msg.indexed_for_rag && (
                            <span className="indexed-badge">RAG</span>
                          )}
                          <span className="message-time">
                            {new Date(msg.received_at).toLocaleString()}
                          </span>
                        </div>
                        <h3 className="message-subject">
                          {msg.subject}
                          {msg.action_status && (
                            <span
                              className={`message-action-indicator ${msg.action_status}`}
                            />
                          )}
                        </h3>
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
                            {msg.content && msg.content.length > 200
                              ? "..."
                              : ""}
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
                          <span className="attachments-label">
                            Attachments:
                          </span>
                          {msg.attachments.map((att) => (
                            <button
                              key={att.id}
                              className="attachment-link"
                              onClick={() => openAttachmentViewer(att)}
                              title={att.filename}
                            >
                              <span
                                className="attachment-icon"
                                aria-hidden="true"
                              >
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

                      {msg.action_note && (
                        <div className="message-action-note">
                          <span className="action-note-label">
                            {msg.action_status === ACTION_STATUS.REQUIRED
                              ? "Action Required:"
                              : "Action Taken:"}
                          </span>
                          <p className="action-note-text">{msg.action_note}</p>
                        </div>
                      )}

                      <div className="message-actions">
                        <button
                          className="btn-mark-read"
                          onClick={() => toggleReadStatus(msg)}
                        >
                          {msg.is_read ? "Mark as Unread" : "Mark as Read"}
                        </button>
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
                {totalPages > 1 && (
                  <div className="pagination-controls">
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map(
                      (page) => {
                        return (
                          <button
                            key={page}
                            className={`pagination-btn ${
                              currentPage === page ? "active" : ""
                            }`}
                            onClick={() => setCurrentPage(page)}
                          >
                            {page}
                          </button>
                        );
                      },
                    )}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </main>

      {/* Toast Container */}
      <div className="toast-container">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast-${toast.type}`}>
            <div className="toast-bar"></div>
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

      <AttachmentViewer
        attachment={viewerAttachment}
        isOpen={viewerOpen}
        onClose={() => setViewerOpen(false)}
      />

      {actionModalOpen && actionModalMessage && actionModalType && (
        <ActionModal
          message={actionModalMessage}
          type={actionModalType}
          onConfirm={handleActionModalConfirm}
          onCancel={handleActionModalCancel}
        />
      )}

      <NoteModal
        isOpen={noteModalOpen}
        note={editingNote}
        onSave={async (noteData) => {
          if (editingNote) {
            const { data, error } = await supabase
              .from("notes")
              .update(noteData)
              .eq("id", editingNote.id)
              .select()
              .single();
            if (error) throw error;
            setNotes((prev) => prev.map((n) => (n.id === editingNote.id ? data : n)));
          } else {
            const { data, error } = await supabase
              .from("notes")
              .insert({ ...noteData, author_id: user.id })
              .select()
              .single();
            if (error) throw error;
            setNotes((prev) => [data, ...prev]);
          }
          setNoteModalOpen(false);
          setEditingNote(null);
          addToast(editingNote ? "Note updated" : "Note saved", "success");
        }}
        onCancel={() => {
          setNoteModalOpen(false);
          setEditingNote(null);
        }}
      />

      <EventModal
        isOpen={!!promoteNote}
        onClose={() => setPromoteNote(null)}
        onSubmit={handlePromoteNoteSave}
        editingEvent={
          promoteNote
            ? { title: promoteNote.title, description: promoteNote.body }
            : null
        }
      />

      <EventModal
        isOpen={!!editingNoteEvent}
        onClose={() => setEditingNoteEvent(null)}
        editingEvent={editingNoteEvent?.event}
        onSubmit={async (formData) => {
          try {
            await updateManualEvent(editingNoteEvent.event.id, formData);
            await loadEvents();
            const { error } = await supabase
              .from("notes")
              .update({ title: formData.title, body: formData.description || null })
              .eq("id", editingNoteEvent.note.id);
            if (!error) {
              setNotes((prev) =>
                prev.map((n) =>
                  n.id === editingNoteEvent.note.id
                    ? { ...n, title: formData.title, body: formData.description || null }
                    : n,
                ),
              );
            }
            setEditingNoteEvent(null);
            addToast("Note and event updated", "success");
          } catch (err) {
            addToast("Failed to update: " + err.message, "error");
            throw err;
          }
        }}
      />

      {import.meta.env.DEV && <Agentation />}
    </div>
  );
}

export default App;
