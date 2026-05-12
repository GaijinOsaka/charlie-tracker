import React, { useState, useEffect } from "react";
import { supabase, updateDisplayName } from "../lib/supabase";
import { useAuth } from "../lib/AuthContext";
import WhatsAppSharing from "./WhatsAppSharing";

export default function SettingsPanel({ onProfileUpdated }) {
  const { user, profile } = useAuth();
  const [profiles, setProfiles] = useState([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviting, setInviting] = useState(false);
  const [message, setMessage] = useState(null);
  const [passwordUserId, setPasswordUserId] = useState(null);
  const [newPassword, setNewPassword] = useState("");
  const [settingPassword, setSettingPassword] = useState(false);
  const [editingDisplayName, setEditingDisplayName] = useState(false);
  const [newDisplayName, setNewDisplayName] = useState("");
  const [savingDisplayName, setSavingDisplayName] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState(
    typeof Notification !== "undefined" ? Notification.permission : "denied",
  );

  const [whatsappPhone, setWhatsappPhone] = useState("");
  const [whatsappEnabled, setWhatsappEnabled] = useState(true);
  const [whatsappWeeklyDigest, setWhatsappWeeklyDigest] = useState(false);
  const [whatsappSaving, setWhatsappSaving] = useState(false);
  const [whatsappTesting, setWhatsappTesting] = useState(false);
  const [whatsappMessage, setWhatsappMessage] = useState(null);

  useEffect(() => {
    loadProfiles();
  }, []);

  useEffect(() => {
    if (user?.id) loadWhatsappSettings();
  }, [user?.id]);

  async function loadProfiles() {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at");
    setProfiles(data || []);
  }

  async function loadWhatsappSettings() {
    try {
      const { data, error } = await supabase
        .from("user_whatsapp_settings")
        .select("whatsapp_phone, whatsapp_enabled, whatsapp_weekly_digest")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      if (data) {
        setWhatsappPhone(data.whatsapp_phone || "");
        setWhatsappEnabled(data.whatsapp_enabled);
        setWhatsappWeeklyDigest(data.whatsapp_weekly_digest);
      }
    } catch (err) {
      console.error("Error loading WhatsApp settings:", err);
    }
  }

  const isValidE164 = (s) => /^\+[1-9]\d{6,14}$/.test(s.trim());

  async function handleSaveWhatsappSettings(e) {
    e.preventDefault();
    setWhatsappMessage(null);
    const phone = whatsappPhone.trim();
    if (phone && !isValidE164(phone)) {
      setWhatsappMessage({
        type: "error",
        text: "Phone must be in international format, e.g. +447700900000",
      });
      return;
    }
    setWhatsappSaving(true);
    try {
      const { error } = await supabase
        .from("user_whatsapp_settings")
        .upsert(
          {
            user_id: user.id,
            whatsapp_phone: phone || null,
            whatsapp_enabled: whatsappEnabled,
            whatsapp_weekly_digest: whatsappWeeklyDigest,
          },
          { onConflict: "user_id" },
        );
      if (error) throw error;
      setWhatsappMessage({ type: "success", text: "WhatsApp settings saved" });
    } catch (err) {
      setWhatsappMessage({ type: "error", text: err.message });
    } finally {
      setWhatsappSaving(false);
    }
  }

  async function handleWhatsappTestSend() {
    setWhatsappMessage(null);
    setWhatsappTesting(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error("Session expired — please sign in again.");
      }
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
      const resp = await fetch(`${supabaseUrl}/functions/v1/whatsapp-test-send`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY?.trim(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(data.error || `HTTP ${resp.status}`);
      }
      setWhatsappMessage({
        type: "success",
        text: `Test sent (Twilio SID ${data?.sid || "unknown"})`,
      });
    } catch (err) {
      setWhatsappMessage({ type: "error", text: err.message });
    } finally {
      setWhatsappTesting(false);
    }
  }

  async function handleInvite(e) {
    e.preventDefault();
    setInviting(true);
    setMessage(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke("invite-user", {
        body: { email: inviteEmail, display_name: inviteName },
        headers: session?.access_token
          ? { Authorization: `Bearer ${session.access_token}` }
          : {},
      });
      if (error) {
        let msg = error.message;
        try {
          if (error.context && typeof error.context.json === "function") {
            const body = await error.context.json();
            msg = body.error || msg;
          }
        } catch (_) {}
        throw new Error(msg);
      }
      if (data?.error) throw new Error(data.error);
      setMessage({ type: "success", text: `Invite sent to ${inviteEmail}` });
      setInviteEmail("");
      setInviteName("");
      loadProfiles();
    } catch (err) {
      setMessage({ type: "error", text: err.message });
    } finally {
      setInviting(false);
    }
  }

  async function handleSetPassword(e) {
    e.preventDefault();
    setSettingPassword(true);
    setMessage(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke(
        "set-user-password",
        {
          body: { target_user_id: passwordUserId, password: newPassword },
          headers: session?.access_token
            ? { Authorization: `Bearer ${session.access_token}` }
            : {},
        },
      );
      if (error) {
        let msg = error.message;
        try {
          if (error.context && typeof error.context.json === "function") {
            const body = await error.context.json();
            msg = body.error || msg;
          }
        } catch (_) {}
        throw new Error(msg);
      }
      if (data?.error) throw new Error(data.error);
      setMessage({ type: "success", text: "Password updated" });
      setPasswordUserId(null);
      setNewPassword("");
    } catch (err) {
      setMessage({ type: "error", text: err.message });
    } finally {
      setSettingPassword(false);
    }
  }

  async function handleUpdateDisplayName(e) {
    e.preventDefault();
    setSavingDisplayName(true);
    setMessage(null);

    try {
      await updateDisplayName(newDisplayName);
      setMessage({ type: "success", text: "Display name updated" });
      setEditingDisplayName(false);
      setNewDisplayName("");
      // Reload profiles in SettingsPanel
      loadProfiles();
      // Reload profiles in App.jsx (parent component) to update ActionsBox and message list
      if (onProfileUpdated) {
        onProfileUpdated();
        // Also reload again after a slight delay to ensure database sync
        setTimeout(() => onProfileUpdated(), 300);
      }
    } catch (err) {
      setMessage({ type: "error", text: err.message });
    } finally {
      setSavingDisplayName(false);
    }
  }

  async function handleNotificationToggle() {
    if (notificationPermission === "granted") {
      // Remove subscription
      try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
          await supabase
            .from("push_subscriptions")
            .delete()
            .match({ user_id: user.id, subscription: subscription.toJSON() });
          await subscription.unsubscribe();
          setNotificationPermission("denied");
        }
      } catch (err) {
        console.error("Error disabling notifications:", err);
      }
    } else {
      // Request permission and subscribe
      try {
        const permission = await Notification.requestPermission();
        if (permission === "granted") {
          // Get service worker registration and subscribe to push
          const registration = await navigator.serviceWorker.ready;
          const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY?.trim();

          if (!vapidKey) {
            throw new Error("Push notifications not configured");
          }

          const subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: vapidKey,
          });

          // Save subscription to database
          await supabase.from("push_subscriptions").insert({
            user_id: user.id,
            subscription: subscription.toJSON(),
          });

          setNotificationPermission("granted");
        }
      } catch (err) {
        console.error("Error enabling notifications:", err);
        setMessage({
          type: "error",
          text: "Failed to enable notifications: " + err.message,
        });
      }
    }
  }

  const canInvite = profiles.length < 2;

  return (
    <div className="settings-panel">
      <h2>Settings</h2>

      <section className="settings-section">
        <h3>Users</h3>
        <ul className="user-list">
          {profiles.map((p) => (
            <li key={p.id} className="user-item">
              <div className="user-item-info">
                <span className="user-item-name">{p.display_name}</span>
                <span className="user-item-email">{p.email}</span>
                {p.id === user.id && (
                  <span className="user-item-you">(you)</span>
                )}
              </div>
              {p.id === user.id && !editingDisplayName && (
                <button
                  className="set-password-btn"
                  onClick={() => {
                    setNewDisplayName(p.display_name);
                    setEditingDisplayName(true);
                    setMessage(null);
                  }}
                >
                  Edit Name
                </button>
              )}
              {p.id === user.id && editingDisplayName && (
                <form
                  onSubmit={handleUpdateDisplayName}
                  className="set-password-form"
                >
                  <input
                    type="text"
                    value={newDisplayName}
                    onChange={(e) => setNewDisplayName(e.target.value)}
                    placeholder="e.g. David"
                    required
                    autoFocus
                  />
                  <div className="set-password-actions">
                    <button
                      type="submit"
                      className="invite-btn"
                      disabled={savingDisplayName}
                    >
                      {savingDisplayName ? "Saving..." : "Save"}
                    </button>
                    <button
                      type="button"
                      className="cancel-btn"
                      onClick={() => {
                        setEditingDisplayName(false);
                        setNewDisplayName("");
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
              {p.id !== user.id && passwordUserId !== p.id && (
                <button
                  className="set-password-btn"
                  onClick={() => {
                    setPasswordUserId(p.id);
                    setNewPassword("");
                    setMessage(null);
                  }}
                >
                  Set Password
                </button>
              )}
              {passwordUserId === p.id && (
                <form
                  onSubmit={handleSetPassword}
                  className="set-password-form"
                >
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="New password (min 6 chars)"
                    minLength={6}
                    required
                    autoFocus
                  />
                  <div className="set-password-actions">
                    <button
                      type="submit"
                      className="invite-btn"
                      disabled={settingPassword}
                    >
                      {settingPassword ? "Saving..." : "Save"}
                    </button>
                    <button
                      type="button"
                      className="cancel-btn"
                      onClick={() => {
                        setPasswordUserId(null);
                        setNewPassword("");
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </li>
          ))}
        </ul>
      </section>

      {canInvite && (
        <section className="settings-section">
          <h3>Invite Partner</h3>
          <form onSubmit={handleInvite} className="invite-form">
            <div className="form-group">
              <label htmlFor="invite-name">Display Name</label>
              <input
                id="invite-name"
                type="text"
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
                placeholder="e.g. Sarah"
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="invite-email">Email</label>
              <input
                id="invite-email"
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="partner@email.com"
                required
              />
            </div>
            {message && (
              <p className={`settings-msg ${message.type}`}>{message.text}</p>
            )}
            <button type="submit" className="invite-btn" disabled={inviting}>
              {inviting ? "Sending..." : "Send Invite"}
            </button>
          </form>
        </section>
      )}

      <section className="settings-section">
        <h3>WhatsApp Reminders</h3>
        <p className="section-description">
          Get event reminders sent to your WhatsApp.
        </p>
        <form onSubmit={handleSaveWhatsappSettings} className="invite-form">
            <div className="form-group">
              <label htmlFor="wa-phone">Phone number</label>
              <input
                id="wa-phone"
                type="tel"
                value={whatsappPhone}
                onChange={(e) => setWhatsappPhone(e.target.value)}
                placeholder="+447700900000"
                autoComplete="tel"
              />
              <small className="text-secondary">
                International format starting with + and country code.
              </small>
            </div>
            <label className="notification-toggle">
              <input
                type="checkbox"
                checked={whatsappEnabled}
                onChange={(e) => setWhatsappEnabled(e.target.checked)}
              />
              <span>Enable WhatsApp reminders</span>
            </label>
            <label className="notification-toggle">
              <input
                type="checkbox"
                checked={whatsappWeeklyDigest}
                onChange={(e) => setWhatsappWeeklyDigest(e.target.checked)}
              />
              <span>Send weekly digest on Sunday evenings</span>
            </label>
            {whatsappMessage && (
              <p className={`settings-msg ${whatsappMessage.type}`}>
                {whatsappMessage.text}
              </p>
            )}
            <div className="set-password-actions">
              <button
                type="submit"
                className="invite-btn"
                disabled={whatsappSaving}
              >
                {whatsappSaving ? "Saving..." : "Save"}
              </button>
              <button
                type="button"
                className="set-password-btn"
                onClick={handleWhatsappTestSend}
                disabled={
                  whatsappTesting ||
                  whatsappSaving ||
                  !whatsappPhone.trim() ||
                  !whatsappEnabled
                }
                title={
                  !whatsappPhone.trim()
                    ? "Save a phone number first"
                    : !whatsappEnabled
                      ? "Enable WhatsApp reminders first"
                      : "Send a test message to your saved number"
                }
              >
                {whatsappTesting ? "Sending..." : "Send test message"}
              </button>
            </div>
          </form>
      </section>

      <section className="settings-section whatsapp-config">
        <h3>WhatsApp Bot Configuration</h3>
        <p className="section-description">
          Manage WhatsApp sharing and access for public/private numbers
        </p>
        <WhatsAppSharing />
      </section>

      <section className="settings-section">
        <h3>Notifications</h3>
        <label className="notification-toggle">
          <input
            type="checkbox"
            checked={notificationPermission === "granted"}
            onChange={handleNotificationToggle}
          />
          <span>Enable push notifications for action items</span>
        </label>
        {notificationPermission === "denied" && (
          <p className="text-secondary">
            Notifications blocked. Enable in browser settings to receive alerts.
          </p>
        )}
      </section>
    </div>
  );
}
