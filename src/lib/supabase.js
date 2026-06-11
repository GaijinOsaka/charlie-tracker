import { createClient } from "@supabase/supabase-js";
import { ACTION_STATUS } from "./constants";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

// Custom storage without Navigator LockManager to avoid timeout issues
const customStorage = {
  getItem: (key) => localStorage.getItem(key),
  setItem: (key, value) => localStorage.setItem(key, value),
  removeItem: (key) => localStorage.removeItem(key),
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    storage: customStorage,
    detectSessionInUrl: true,
    lock: async (_name, _acquireTimeout, fn) => await fn(),
  },
});

// Event CRUD functions for manual event creation
export async function createManualEvent(eventData) {
  // eventData: { title, event_date, event_end_date, event_time, event_end_time, description, action_required, action_detail }
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("User not authenticated");

  const { data, error } = await supabase
    .from("events")
    .insert([
      {
        title: eventData.title,
        event_date: eventData.event_date,
        event_end_date: eventData.event_end_date || null,
        event_time: eventData.event_time || null,
        event_end_time: eventData.event_end_time || null,
        description: eventData.description || null,
        action_required: eventData.action_required || false,
        action_detail: eventData.action_detail || null,
        reminder: eventData.reminder || "none",
        created_by: user.id,
        source_type: "manual",
        message_id: null,
        document_id: null,
      },
    ])
    .select();

  if (error) throw error;
  return data[0];
}

export async function updateManualEvent(eventId, eventData) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("User not authenticated");

  // Verify user is the creator (RLS will enforce, but check client-side too)
  const { data: event, error: fetchError } = await supabase
    .from("events")
    .select("created_by")
    .eq("id", eventId)
    .single();

  if (fetchError) throw fetchError;
  if (event.created_by !== user.id)
    throw new Error("Only event creator can edit");

  const { data, error } = await supabase
    .from("events")
    .update({
      title: eventData.title,
      event_date: eventData.event_date,
      event_end_date: eventData.event_end_date || null,
      event_time: eventData.event_time || null,
      event_end_time: eventData.event_end_time || null,
      description: eventData.description || null,
      action_required: eventData.action_required || false,
      action_detail: eventData.action_detail || null,
      reminder: eventData.reminder || "none",
      // Re-flagging a previously-actioned event clears its actioned stamp so it
      // returns to Action Required cleanly.
      ...(eventData.action_required ? { actioned_at: null, actioned_by: null } : {}),
    })
    .eq("id", eventId)
    .select();

  if (error) throw error;
  return data[0];
}

// Mark a calendar event actioned (stamps actioned_at/actioned_by, drops the
// action_required flag, optionally records a closing note in action_detail) or
// clear its action state entirely. Mirrors updateActionStatus for messages.
export async function setEventActionState(eventId, { actioned, note } = {}) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("User not authenticated");

  const update = { action_required: false };
  if (actioned) {
    update.actioned_at = new Date().toISOString();
    update.actioned_by = user.id;
    if (note != null && note !== "") update.action_detail = note;
  } else {
    update.actioned_at = null;
    update.actioned_by = null;
  }

  const { data, error } = await supabase
    .from("events")
    .update(update)
    .eq("id", eventId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Set a note's action state: flag as action-required, mark actioned, or clear.
//   { actionRequired: true }            -> flag (pending)
//   { actioned: true, note }            -> mark actioned (stamps actioned_at)
//   { actionRequired: false }           -> clear
export async function setNoteActionState(noteId, opts = {}) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("User not authenticated");

  let update;
  if (opts.actioned) {
    update = { action_required: false, actioned_at: new Date().toISOString(), actioned_by: user.id };
  } else if (opts.actionRequired) {
    // Flag (or re-flag) — clear any prior actioned stamp.
    update = { action_required: true, actioned_at: null, actioned_by: null };
  } else {
    update = { action_required: false, actioned_at: null, actioned_by: null };
  }

  const { data, error } = await supabase
    .from("notes")
    .update(update)
    .eq("id", noteId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteManualEvent(eventId) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("User not authenticated");

  // Verify user is the creator (RLS will enforce, but check client-side too)
  const { data: event, error: fetchError } = await supabase
    .from("events")
    .select("created_by")
    .eq("id", eventId)
    .single();

  if (fetchError) throw fetchError;
  if (event.created_by !== user.id)
    throw new Error("Only event creator can delete");

  const { error } = await supabase.from("events").delete().eq("id", eventId);

  if (error) throw error;
}

// Message action status functions
export async function updateActionStatus(messageId, newStatus, note) {
  // newStatus can be: 'action_required', 'actioned', or null
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("User not authenticated");

  const updateData = {
    action_status: newStatus,
    action_note: note || null,
  };

  // Add actioned timestamp and user ID for 'actioned' status
  if (newStatus === ACTION_STATUS.ACTIONED) {
    updateData.actioned_at = new Date().toISOString();
    updateData.actioned_by = user.id;
  } else if (newStatus === null) {
    // Clear both status and note when clearing
    updateData.actioned_at = null;
    updateData.actioned_by = null;
  }

  const { error } = await supabase
    .from("messages")
    .update(updateData)
    .eq("id", messageId);

  if (error) {
    console.error("Failed to update action status:", error);
    throw error;
  }
}

// Update user profile display name
export async function updateDisplayName(displayName) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("User not authenticated");

  const { error } = await supabase
    .from("profiles")
    .update({ display_name: displayName })
    .eq("id", user.id);

  if (error) {
    console.error("Failed to update display name:", error);
    throw error;
  }
}

// Trigger push notifications for action_required status
export async function triggerPushNotifications(message, previousStatus) {
  // Only trigger if status changed TO action_required
  if (
    message.action_status !== ACTION_STATUS.REQUIRED ||
    previousStatus === ACTION_STATUS.REQUIRED
  ) {
    return;
  }

  try {
    const response = await supabase.functions.invoke("notify-action-required", {
      body: {
        id: message.id,
        status: message.action_status,
        subject: message.subject,
        body: message.content,
        sender: message.sender_name,
        old_status: previousStatus,
        action_note: message.action_note || null,
      },
    });

    if (response.error) {
      console.error("Failed to trigger notifications:", response.error);
    }
  } catch (error) {
    console.error("Error calling notify-action-required function:", error);
  }
}
