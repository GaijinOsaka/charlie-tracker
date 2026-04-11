import React, { useState } from "react";
import { supabase } from "../lib/supabase";
import TagEditor from "./TagEditor";

const CATEGORY_COLORS = {
  academic: { bg: "#dbeafe", color: "#1e40af" },
  admin: { bg: "#fef3c7", color: "#92400e" },
  events: { bg: "#d1fae5", color: "#065f46" },
  health: { bg: "#fee2e2", color: "#991b1b" },
  pastoral: { bg: "#ede9fe", color: "#5b21b6" },
  general: { bg: "#f3f4f6", color: "#374151" },
  other: { bg: "#f3f4f6", color: "#374151" },
};

export default function DocumentCard({
  document: doc,
  onUpdate,
  onDelete,
  selected,
  onToggleSelect,
  isShareable,
  onShareableChange,
  sharingLoading,
}) {
  const [downloading, setDownloading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [indexing, setIndexing] = useState(false);
  const tags = doc.tags || [];
  const categoryStyle =
    CATEGORY_COLORS[doc.category] || CATEGORY_COLORS.other;

  function formatDate(dateString) {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(date);
  }

  async function handleDownload() {
    setDownloading(true);
    try {
      const { data, error } = await supabase.storage
        .from("charlie-documents")
        .download(doc.file_path);

      if (error) throw error;
      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      a.download = doc.filename || doc.file_path.split("/").pop();
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Download error:", err);
    } finally {
      setDownloading(false);
    }
  }

  async function toggleRagFlag() {
    // Prevent concurrent calls
    if (indexing) return;

    const action = doc.indexed_for_rag ? "remove" : "index";
    setIndexing(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      console.log("Session:", session);
      console.log("Access token:", session?.access_token ? "exists" : "missing");
      console.log(
        "Token preview:",
        session?.access_token?.substring(0, 20) + "..."
      );

      if (!session?.access_token) {
        throw new Error(
          "Not authenticated. Please log in to index documents."
        );
      }

      const authHeader = `Bearer ${session.access_token}`;
      console.log("Auth header length:", authHeader.length);
      console.log("Invoking with headers:", { Authorization: "Bearer ..." });

      const { data, error } = await supabase.functions.invoke(
        "index-document",
        {
          body: { doc_id: doc.id, action },
          headers: {
            Authorization: authHeader,
          },
        },
      );

      console.log("Response:", { data, error });

      if (error) {
        let msg = error.message;
        let detail = "";

        // Log full error object for debugging
        console.error("Full error object:", error);
        console.error("Error keys:", Object.keys(error));

        // Try different ways to extract the response body
        try {
          if (error.context && typeof error.context.json === "function") {
            const body = await error.context.json();
            console.log("Error body from context.json():", body);
            msg = body.error || msg;
            detail = body.detail || "";
            if (body.errorName) detail = `${detail} (${body.errorName})`;
            if (body.userNull !== undefined) detail = `${detail} [user: ${body.userNull ? "null" : "exists"}]`;
          }
        } catch (parseErr) {
          console.error("Error parsing error.context.json():", parseErr);
        }

        // Try to get status code if available
        if (error.status) {
          msg = `${msg} (HTTP ${error.status})`;
        }

        throw new Error(detail ? `${msg}: ${detail}` : msg);
      }
      if (data && !data.success)
        throw new Error(data.error || "Indexing failed");

      if (data?.status === "extracting") {
        alert(
          data.message ||
            "PDF text extraction started. This takes 2-3 minutes. The document will be indexed automatically.",
        );
        return;
      }

      if (onUpdate) {
        onUpdate({ ...doc, indexed_for_rag: action === "index" });
      }
    } catch (err) {
      console.error("RAG toggle error:", err);
      alert(`Failed to ${action} document: ${err.message}`);
    } finally {
      setIndexing(false);
    }
  }

  async function handleDelete() {
    if (
      !window.confirm(
        `Delete "${doc.filename}"? This will remove the file from storage and the database.`,
      )
    ) {
      return;
    }
    setDeleting(true);
    try {
      // Delete from storage
      if (doc.file_path) {
        await supabase.storage
          .from("charlie-documents")
          .remove([doc.file_path]);
      }
      // Delete from database (cascades to document_chunks)
      const { error } = await supabase
        .from("documents")
        .delete()
        .eq("id", doc.id);
      if (error) throw error;
      if (onDelete) onDelete(doc.id);
    } catch (err) {
      console.error("Delete error:", err);
      alert("Failed to delete document: " + err.message);
      setDeleting(false);
    }
  }

  async function handleToggleShareable() {
    if (onShareableChange) {
      await onShareableChange(doc.id, isShareable);
    }
  }

  return (
    <div className={`doc-card ${selected ? "doc-card-selected" : ""}`}>
      <div className="doc-card-header">
        <input
          type="checkbox"
          className="doc-checkbox"
          checked={!!selected}
          onChange={onToggleSelect}
        />
        <span className="doc-icon">
          {doc.filename?.endsWith(".pdf") ? "\u{1F4C4}" : "\u{1F4CE}"}
        </span>
        <div className="doc-header-text">
          <h4 className="doc-filename" title={doc.filename}>
            {doc.filename}
          </h4>
          {doc.created_at && (
            <span className="doc-upload-date">
              {formatDate(doc.created_at)}
            </span>
          )}
        </div>
      </div>

      <div className="doc-card-meta">
        <span
          className="doc-category-badge"
          style={{ background: categoryStyle.bg, color: categoryStyle.color }}
        >
          {doc.category || "other"}
        </span>
        {/* RAG Status Badge */}
        {doc.rag_status === "indexing" && (
          <span className="doc-rag-badge rag-indexing">
            ⏳ Indexing...
          </span>
        )}
        {doc.rag_status === "extracting" && (
          <span className="doc-rag-badge rag-extracting">
            📄 Extracting (2-3 min)
          </span>
        )}
        {doc.rag_status === "indexed" && (
          <span className="doc-rag-badge rag-yes">
            ⚡ Indexed
          </span>
        )}
        {doc.rag_status === "failed" && (
          <span className="doc-rag-badge rag-failed">
            ❌ Failed
          </span>
        )}
        {(!doc.rag_status || doc.rag_status === "idle") && (
          <span className="doc-rag-badge rag-no">
            🔒 Not Indexed
          </span>
        )}

        {doc.indexed_for_rag && (
          <span className="doc-text-badge">Text Extracted</span>
        )}
        {doc.dates_extracted && (
          <span className="doc-dates-badge">Dates Extracted</span>
        )}

        {/* Shareable Badge */}
        {isShareable && (
          <span
            className="doc-shareable-badge"
            title="Shareable via WhatsApp"
          >
            💬 Shareable
          </span>
        )}
      </div>

      {/* RAG Error Message */}
      {doc.rag_status === "failed" && doc.rag_error && (
        <div className="doc-error-message">
          <strong>Error:</strong> {doc.rag_error}
        </div>
      )}

      {tags.length > 0 && (
        <div className="doc-tags">
          {tags.slice(0, 4).map((tag) => (
            <span key={tag} className="doc-tag">
              {tag}
            </span>
          ))}
          {tags.length > 4 && (
            <span className="doc-tag doc-tag-more">+{tags.length - 4}</span>
          )}
        </div>
      )}

      <div className="doc-card-actions">
        <button
          className="btn-doc btn-download"
          onClick={handleDownload}
          disabled={downloading}
        >
          {downloading ? "Opening..." : "Download"}
        </button>
        <button
          className={`btn-doc ${isShareable ? "btn-shareable-active" : "btn-shareable"}`}
          onClick={handleToggleShareable}
          disabled={sharingLoading}
          title={isShareable ? "Click to remove from WhatsApp sharing" : "Click to share via WhatsApp"}
        >
          {sharingLoading ? "Updating..." : isShareable ? "Unshare" : "Share"}
        </button>
        {doc.rag_status === "failed" ? (
          <button
            className="btn-doc btn-retry-rag"
            onClick={toggleRagFlag}
            disabled={indexing}
            title="Retry RAG indexing"
          >
            {indexing ? "Retrying..." : "Retry"}
          </button>
        ) : (
          <button
            className={`btn-doc ${doc.indexed_for_rag ? "btn-remove-rag" : "btn-add-rag"}`}
            onClick={toggleRagFlag}
            disabled={indexing || doc.rag_status === "indexing" || doc.rag_status === "extracting"}
          >
            {doc.rag_status === "indexing" || doc.rag_status === "extracting"
              ? doc.rag_status === "extracting"
                ? "Extracting..."
                : "Indexing..."
              : doc.indexed_for_rag
                ? "Remove from RAG"
                : "Add to RAG"}
          </button>
        )}
        <button
          className="btn-doc btn-delete"
          onClick={handleDelete}
          disabled={deleting}
        >
          {deleting ? "Deleting..." : "Delete"}
        </button>
      </div>

      <TagEditor document={doc} onUpdate={onUpdate} />
    </div>
  );
}
