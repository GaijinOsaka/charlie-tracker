import { createClient } from "@supabase/supabase-js";

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
  // eventData: { title, event_date, event_time, event_end_time, description, action_required, action_detail }
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) throw new Error('User not authenticated');

  const { data, error } = await supabase
    .from('events')
    .insert([{
      title: eventData.title,
      event_date: eventData.event_date,
      event_time: eventData.event_time || null,
      event_end_time: eventData.event_end_time || null,
      description: eventData.description || null,
      action_required: eventData.action_required || false,
      action_detail: eventData.action_detail || null,
      created_by: user.id,
      source_type: 'manual',
      message_id: null,
      document_id: null
    }])
    .select()

  if (error) throw error;
  return data[0];
}

export async function updateManualEvent(eventId, eventData) {
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) throw new Error('User not authenticated');

  // Verify user is the creator (RLS will enforce, but check client-side too)
  const { data: event, error: fetchError } = await supabase
    .from('events')
    .select('created_by')
    .eq('id', eventId)
    .single();

  if (fetchError) throw fetchError;
  if (event.created_by !== user.id) throw new Error('Only event creator can edit');

  const { data, error } = await supabase
    .from('events')
    .update({
      title: eventData.title,
      event_date: eventData.event_date,
      event_time: eventData.event_time || null,
      event_end_time: eventData.event_end_time || null,
      description: eventData.description || null,
      action_required: eventData.action_required || false,
      action_detail: eventData.action_detail || null
    })
    .eq('id', eventId)
    .select()

  if (error) throw error;
  return data[0];
}

export async function deleteManualEvent(eventId) {
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) throw new Error('User not authenticated');

  // Verify user is the creator (RLS will enforce, but check client-side too)
  const { data: event, error: fetchError } = await supabase
    .from('events')
    .select('created_by')
    .eq('id', eventId)
    .single();

  if (fetchError) throw fetchError;
  if (event.created_by !== user.id) throw new Error('Only event creator can delete');

  const { error } = await supabase
    .from('events')
    .delete()
    .eq('id', eventId)

  if (error) throw error;
}
