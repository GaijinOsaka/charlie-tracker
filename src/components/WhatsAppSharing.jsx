import React, { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/AuthContext";

export default function WhatsAppSharing() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("public"); // public, shareable, private, audit

  // Public Number Management
  const publicNumber =
    import.meta.env.VITE_TWILIO_PUBLIC_NUMBER || "+1234567890";
  const [publicActive, setPublicActive] = useState(true);
  const [publicQueries, setPublicQueries] = useState([]);
  const [publicLoading, setPublicLoading] = useState(false);

  // Shareable Content Manager
  const [documents, setDocuments] = useState([]);
  const [events, setEvents] = useState([]);
  const [shareableContent, setShareableContent] = useState({});
  const [shareableLoading, setShareableLoading] = useState(false);
  const [savingContentId, setSavingContentId] = useState(null);

  // Private Number Management
  const privateNumber =
    import.meta.env.VITE_TWILIO_PRIVATE_NUMBER || "+0987654321";
  const [whatsappUsers, setWhatsappUsers] = useState([]);
  const [newUserEmail, setNewUserEmail] = useState("");
  const [addingUser, setAddingUser] = useState(false);
  const [privLoading, setPrivLoading] = useState(false);

  // Audit Log
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditFilter, setAuditFilter] = useState("public"); // public, private, all
  const [auditLoading, setAuditLoading] = useState(false);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);

  // Load initial data
  useEffect(() => {
    if (!user) return;

    loadPublicQueries();
    loadShareableContent();
    loadWhatsappUsers();
    loadAuditLogs();

    // Subscribe to realtime updates for whatsapp_interactions
    const auditChannel = supabase
      .channel("public:whatsapp_interactions")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "whatsapp_interactions" },
        () => {
          loadPublicQueries();
          loadAuditLogs();
        },
      )
      .subscribe();

    // Subscribe to realtime updates for shareable_content
    const shareChannel = supabase
      .channel("public:shareable_content")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "shareable_content" },
        () => {
          loadShareableContent();
        },
      )
      .subscribe();

    return () => {
      auditChannel.unsubscribe();
      shareChannel.unsubscribe();
    };
  }, [user]);

  // ====================
  // PUBLIC NUMBER
  // ====================
  async function loadPublicQueries() {
    try {
      setPublicLoading(true);
      const { data, error } = await supabase
        .from("whatsapp_interactions")
        .select("id, access_level, query_text, response_text, phone_number_hash, created_at")
        .eq("access_level", "public")
        .order("created_at", { ascending: false })
        .limit(5);

      if (error) throw error;
      setPublicQueries(data || []);
    } catch (err) {
      console.error("Error loading public queries:", err);
      setError("Failed to load public queries");
    } finally {
      setPublicLoading(false);
    }
  }

  function togglePublicActive() {
    setPublicActive(!publicActive);
    setMessage({
      type: "success",
      text: `Public sharing ${!publicActive ? "enabled" : "disabled"}`,
    });
  }

  // ====================
  // SHAREABLE CONTENT
  // ====================
  async function loadShareableContent() {
    try {
      setShareableLoading(true);

      // Fetch all documents
      const { data: docsData, error: docsError } = await supabase
        .from("documents")
        .select("id, filename, description")
        .order("created_at", { ascending: false });

      if (docsError) throw docsError;
      setDocuments(docsData || []);

      // Fetch all events
      const { data: eventsData, error: eventsError } = await supabase
        .from("events")
        .select("id, title, event_date, description")
        .order("event_date", { ascending: false });

      if (eventsError) throw eventsError;
      setEvents(eventsData || []);

      // Fetch shareable_content mappings
      const { data: shareData, error: shareError } = await supabase
        .from("shareable_content")
        .select("*");

      if (shareError) throw shareError;

      const shareMap = {};
      (shareData || []).forEach((item) => {
        shareMap[`${item.content_type}_${item.content_id}`] = item;
      });
      setShareableContent(shareMap);
    } catch (err) {
      console.error("Error loading shareable content:", err);
      setError("Failed to load shareable content");
    } finally {
      setShareableLoading(false);
    }
  }

  async function toggleShareable(contentType, contentId) {
    try {
      setSavingContentId(`${contentType}_${contentId}`);
      const key = `${contentType}_${contentId}`;
      const current = shareableContent[key];

      if (current) {
        // Update existing
        const { error } = await supabase
          .from("shareable_content")
          .update({ is_shareable: !current.is_shareable })
          .eq("id", current.id);

        if (error) throw error;
      } else {
        // Create new
        const { error } = await supabase.from("shareable_content").insert({
          content_type: contentType,
          content_id: contentId,
          is_shareable: true,
          shared_description: "",
        });

        if (error) throw error;
      }

      await loadShareableContent();
      setMessage({
        type: "success",
        text: `${contentType === "document" ? "Document" : "Event"} sharing updated`,
      });
    } catch (err) {
      console.error("Error toggling shareable:", err);
      setError("Failed to update sharing status");
    } finally {
      setSavingContentId(null);
    }
  }

  async function updateShareDescription(contentType, contentId, description) {
    try {
      setSavingContentId(`${contentType}_${contentId}`);
      const key = `${contentType}_${contentId}`;
      const current = shareableContent[key];

      if (current) {
        const { error } = await supabase
          .from("shareable_content")
          .update({ shared_description: description })
          .eq("id", current.id);

        if (error) throw error;

        await loadShareableContent();
        setMessage({ type: "success", text: "Description updated" });
      }
    } catch (err) {
      console.error("Error updating description:", err);
      setError("Failed to update description");
    } finally {
      setSavingContentId(null);
    }
  }

  // ====================
  // PRIVATE NUMBER
  // ====================
  async function loadWhatsappUsers() {
    try {
      setPrivLoading(true);
      const { data, error } = await supabase
        .from("whatsapp_users")
        .select("id, phone_number_hash, role, is_active, created_at")
        .eq("role", "parent")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setWhatsappUsers(data || []);
    } catch (err) {
      console.error("Error loading whatsapp users:", err);
      setError("Failed to load authorized users");
    } finally {
      setPrivLoading(false);
    }
  }

  async function addWhatsappUser(e) {
    e.preventDefault();
    if (!newUserEmail) return;

    try {
      setAddingUser(true);

      // Find user by email in profiles
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id")
        .eq("email", newUserEmail)
        .single();

      if (profileError) throw new Error("User not found");

      // Create phone_number_hash (placeholder - would be real phone in production)
      const phoneHash = `hash_${profile.id.substring(0, 8)}`;

      const { error } = await supabase.from("whatsapp_users").insert({
        phone_number_hash: phoneHash,
        role: "parent",
        is_active: true,
      });

      if (error) throw error;

      setNewUserEmail("");
      await loadWhatsappUsers();
      setMessage({
        type: "success",
        text: `User ${newUserEmail} authorized for private WhatsApp`,
      });
    } catch (err) {
      console.error("Error adding user:", err);
      setError(err.message || "Failed to add user");
    } finally {
      setAddingUser(false);
    }
  }

  async function toggleUserActive(userId, currentActive) {
    try {
      const { error } = await supabase
        .from("whatsapp_users")
        .update({ is_active: !currentActive })
        .eq("id", userId);

      if (error) throw error;

      await loadWhatsappUsers();
      setMessage({
        type: "success",
        text: `User access ${!currentActive ? "enabled" : "disabled"}`,
      });
    } catch (err) {
      console.error("Error toggling user:", err);
      setError("Failed to update user access");
    }
  }

  // ====================
  // AUDIT LOG
  // ====================
  async function loadAuditLogs() {
    try {
      setAuditLoading(true);

      let query = supabase
        .from("whatsapp_interactions")
        .select(
          "id, access_level, query_text, response_text, phone_number_hash, created_at",
        );

      if (auditFilter === "public") {
        query = query.eq("access_level", "public");
      } else if (auditFilter === "private") {
        query = query.eq("access_level", "private");
      }

      if (fromDate) {
        query = query.gte("created_at", new Date(fromDate).toISOString());
      }

      if (toDate) {
        query = query.lte("created_at", new Date(toDate).toISOString());
      }

      const { data, error } = await query
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      setAuditLogs(data || []);
    } catch (err) {
      console.error("Error loading audit logs:", err);
      setError("Failed to load audit logs");
    } finally {
      setAuditLoading(false);
    }
  }

  function formatDate(dateString) {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function truncateText(text, length) {
    if (!text) return "";
    return text.length > length ? text.substring(0, length) + "..." : text;
  }

  return (
    <div className="whatsapp-sharing">
      <h2>WhatsApp Sharing Admin Panel</h2>

      {error && (
        <div className="error-message">
          {error}
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}

      {message && (
        <div className={`message-toast ${message.type}`}>
          {message.text}
          <button onClick={() => setMessage(null)}>×</button>
        </div>
      )}

      <div className="whatsapp-tabs">
        <button
          className={`tab-btn ${activeTab === "public" ? "active" : ""}`}
          onClick={() => setActiveTab("public")}
        >
          Public Number
        </button>
        <button
          className={`tab-btn ${activeTab === "shareable" ? "active" : ""}`}
          onClick={() => setActiveTab("shareable")}
        >
          Shareable Content
        </button>
        <button
          className={`tab-btn ${activeTab === "private" ? "active" : ""}`}
          onClick={() => setActiveTab("private")}
        >
          Private Number
        </button>
        <button
          className={`tab-btn ${activeTab === "audit" ? "active" : ""}`}
          onClick={() => setActiveTab("audit")}
        >
          Audit Log
        </button>
      </div>

      {/* PUBLIC NUMBER */}
      {activeTab === "public" && (
        <section className="whatsapp-section">
          <div className="section-header">
            <h3>Public WhatsApp Number</h3>
            <button
              className={`toggle-btn ${publicActive ? "active" : ""}`}
              onClick={togglePublicActive}
            >
              {publicActive ? "Active" : "Inactive"}
            </button>
          </div>

          <div className="public-number-info">
            <div className="number-display">
              <label>Public Number</label>
              <code>{publicNumber}</code>
            </div>

            <div className="qr-code-placeholder">
              <label>QR Code</label>
              <svg width="150" height="150" viewBox="0 0 150 150" style={{ border: "2px solid #ccc", borderRadius: "4px" }}>
                <rect width="150" height="150" fill="#f0f0f0" />
                <text x="75" y="75" textAnchor="middle" dy="0.3em" fill="#999" fontSize="12" fontFamily="sans-serif">
                  QR Code
                </text>
              </svg>
            </div>
          </div>

          <div className="recent-queries">
            <h4>Recent Public Queries (Last 5)</h4>
            {publicLoading ? (
              <p className="loading">Loading...</p>
            ) : publicQueries.length === 0 ? (
              <p className="muted">No public queries yet</p>
            ) : (
              <ul className="query-list">
                {publicQueries.map((q) => (
                  <li key={q.id} className="query-item">
                    <div className="query-meta">
                      <span className="query-date">{formatDate(q.created_at)}</span>
                      <span className="query-type">{q.access_level || "unknown"}</span>
                    </div>
                    {q.query_text && (
                      <p className="query-text">
                        <strong>Query:</strong> {truncateText(q.query_text, 150)}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      {/* SHAREABLE CONTENT */}
      {activeTab === "shareable" && (
        <section className="whatsapp-section">
          <h3>Shareable Content Manager</h3>

          {shareableLoading ? (
            <p className="loading">Loading content...</p>
          ) : (
            <>
              <div className="content-group">
                <h4>Documents</h4>
                {documents.length === 0 ? (
                  <p className="muted">No documents available</p>
                ) : (
                  <ul className="content-list">
                    {documents.map((doc) => {
                      const key = `document_${doc.id}`;
                      const shareInfo = shareableContent[key];
                      const isSharing = shareInfo?.is_shareable || false;
                      const isSaving = savingContentId === key;

                      return (
                        <li key={doc.id} className="content-item">
                          <div className="content-main">
                            <div className="content-info">
                              <h5>{doc.filename}</h5>
                              <input
                                type="text"
                                placeholder="Add description for sharing"
                                defaultValue={shareInfo?.shared_description || ""}
                                onChange={(e) =>
                                  updateShareDescription(
                                    "document",
                                    doc.id,
                                    e.target.value,
                                  )
                                }
                                disabled={isSaving}
                                className="content-description"
                              />
                            </div>
                            <label className="checkbox-label">
                              <input
                                type="checkbox"
                                checked={isSharing}
                                onChange={() =>
                                  toggleShareable("document", doc.id)
                                }
                                disabled={isSaving}
                              />
                              <span>{isSharing ? "Shareable" : "Private"}</span>
                            </label>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <div className="content-group">
                <h4>Events</h4>
                {events.length === 0 ? (
                  <p className="muted">No events available</p>
                ) : (
                  <ul className="content-list">
                    {events.map((evt) => {
                      const key = `event_${evt.id}`;
                      const shareInfo = shareableContent[key];
                      const isSharing = shareInfo?.is_shareable || false;
                      const isSaving = savingContentId === key;

                      return (
                        <li key={evt.id} className="content-item">
                          <div className="content-main">
                            <div className="content-info">
                              <h5>{evt.title}</h5>
                              <p className="event-date">
                                {new Date(evt.event_date).toLocaleDateString(
                                  "en-US",
                                  {
                                    month: "short",
                                    day: "numeric",
                                    year: "numeric",
                                  },
                                )}
                              </p>
                              <input
                                type="text"
                                placeholder="Add description for sharing"
                                defaultValue={shareInfo?.shared_description || ""}
                                onChange={(e) =>
                                  updateShareDescription(
                                    "event",
                                    evt.id,
                                    e.target.value,
                                  )
                                }
                                disabled={isSaving}
                                className="content-description"
                              />
                            </div>
                            <label className="checkbox-label">
                              <input
                                type="checkbox"
                                checked={isSharing}
                                onChange={() => toggleShareable("event", evt.id)}
                                disabled={isSaving}
                              />
                              <span>{isSharing ? "Shareable" : "Private"}</span>
                            </label>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </>
          )}
        </section>
      )}

      {/* PRIVATE NUMBER */}
      {activeTab === "private" && (
        <section className="whatsapp-section">
          <div className="section-header">
            <h3>Private WhatsApp Number</h3>
          </div>

          <div className="private-number-info">
            <div className="number-display">
              <label>Private Number</label>
              <code>{privateNumber}</code>
            </div>

            <form className="add-user-form" onSubmit={addWhatsappUser}>
              <h4>Authorize New User</h4>
              <input
                type="email"
                placeholder="User email address"
                value={newUserEmail}
                onChange={(e) => setNewUserEmail(e.target.value)}
                disabled={addingUser}
                required
              />
              <button type="submit" disabled={addingUser}>
                {addingUser ? "Adding..." : "Add User"}
              </button>
            </form>
          </div>

          <div className="authorized-users">
            <h4>Authorized Users</h4>
            {privLoading ? (
              <p className="loading">Loading users...</p>
            ) : whatsappUsers.length === 0 ? (
              <p className="muted">No authorized users yet</p>
            ) : (
              <ul className="user-list">
                {whatsappUsers.map((wu) => (
                  <li key={wu.id} className="user-item">
                    <div className="user-info">
                      <p className="user-hash">{wu.phone_number_hash}</p>
                      <p className="user-role">Role: {wu.role}</p>
                      <p className="user-date">
                        Added {formatDate(wu.created_at)}
                      </p>
                    </div>
                    <label className="toggle-label">
                      <input
                        type="checkbox"
                        checked={wu.is_active}
                        onChange={() => toggleUserActive(wu.id, wu.is_active)}
                      />
                      <span>
                        {wu.is_active ? "Active" : "Inactive"}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      {/* AUDIT LOG */}
      {activeTab === "audit" && (
        <section className="whatsapp-section">
          <h3>Audit Log</h3>

          <div className="audit-filters">
            <div className="filter-group">
              <label>Filter by type</label>
              <select
                value={auditFilter}
                onChange={(e) => {
                  setAuditFilter(e.target.value);
                  loadAuditLogs();
                }}
              >
                <option value="all">All Interactions</option>
                <option value="public">Public Only</option>
                <option value="private">Private Only</option>
              </select>
            </div>

            <div className="filter-group">
              <label>From Date</label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
              />
            </div>

            <div className="filter-group">
              <label>To Date</label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
              />
            </div>

            <button className="filter-apply-btn" onClick={loadAuditLogs}>
              Apply Filters
            </button>
          </div>

          {auditLoading ? (
            <p className="loading">Loading audit logs...</p>
          ) : auditLogs.length === 0 ? (
            <p className="muted">No interactions found</p>
          ) : (
            <div className="audit-logs">
              {auditLogs.map((log) => (
                <div key={log.id} className="audit-entry">
                  <div className="entry-header">
                    <span className="entry-date">{formatDate(log.created_at)}</span>
                    <span
                      className={`entry-type ${
                        log.access_level === "private" ? "private" : "public"
                      }`}
                    >
                      {log.access_level || "unknown"}
                    </span>
                  </div>
                  {log.query_text && (
                    <p className="entry-query">
                      <strong>Query:</strong> {truncateText(log.query_text, 150)}
                    </p>
                  )}
                  {log.response_text && (
                    <p className="entry-response">
                      <strong>Response:</strong>{" "}
                      {truncateText(log.response_text, 150)}
                    </p>
                  )}
                  {log.phone_number_hash && (
                    <p className="entry-source">
                      <strong>From:</strong> {log.phone_number_hash}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
