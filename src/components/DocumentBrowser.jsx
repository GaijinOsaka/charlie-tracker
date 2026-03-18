import React, { useState, useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";
import DocumentCard from "./DocumentCard";
import { AVAILABLE_TAGS } from "./TagEditor";

const CATEGORIES = [
  "all",
  "academic",
  "admin",
  "events",
  "health",
  "pastoral",
  "general",
  "other",
];

export default function DocumentBrowser() {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [tagFilter, setTagFilter] = useState("");
  const [ragFilter, setRagFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selected, setSelected] = useState(new Set());
  const [batchDeleting, setBatchDeleting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    loadDocuments();

    // Subscribe to realtime updates on documents table
    const channel = supabase
      .channel("public:documents")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "documents" },
        (payload) => {
          setDocuments((prev) =>
            prev.map((d) =>
              d.id === payload.new.id ? { ...d, ...payload.new } : d,
            ),
          );
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "documents" },
        () => {
          // Reload to get full document with all fields
          loadDocuments();
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "documents" },
        (payload) => {
          setDocuments((prev) => prev.filter((d) => d.id !== payload.old.id));
        },
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, []);

  async function loadDocuments() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("documents")
        .select(
          "id, filename, file_path, source_url, source_type, tags, category, indexed_for_rag, dates_extracted, created_at, rag_status, rag_error, last_rag_attempt",
        )
        .order("filename", { ascending: true });

      if (error) throw error;
      setDocuments(data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const storagePath = `uploads/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("charlie-documents")
        .upload(storagePath, file);
      if (uploadError) throw uploadError;

      const { error: insertError } = await supabase.from("documents").insert({
        filename: file.name,
        file_path: storagePath,
        source_type: "upload",
        category: "other",
        tags: ["upload"],
      });
      if (insertError) throw insertError;

      await loadDocuments();
    } catch (err) {
      console.error("Upload error:", err);
      alert("Failed to upload document: " + err.message);
    } finally {
      setUploading(false);
      // Reset file input so the same file can be uploaded again
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function handleDocumentUpdate(updated) {
    setDocuments((prev) =>
      prev.map((d) => (d.id === updated.id ? updated : d)),
    );
  }

  function handleDocumentDelete(id) {
    setDocuments((prev) => prev.filter((d) => d.id !== id));
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  function toggleSelect(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllFiltered() {
    const filteredIds = filtered.map((d) => d.id);
    const allSelected = filteredIds.every((id) => selected.has(id));
    if (allSelected) {
      setSelected((prev) => {
        const next = new Set(prev);
        filteredIds.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      setSelected((prev) => {
        const next = new Set(prev);
        filteredIds.forEach((id) => next.add(id));
        return next;
      });
    }
  }

  async function handleBatchDelete() {
    const count = selected.size;
    if (count === 0) return;
    if (
      !window.confirm(
        `Delete ${count} selected document${count > 1 ? "s" : ""}? This will remove files from storage and the database.`,
      )
    ) {
      return;
    }

    setBatchDeleting(true);
    try {
      const selectedDocs = documents.filter((d) => selected.has(d.id));

      // Delete from storage (batch)
      const filePaths = selectedDocs.map((d) => d.file_path).filter(Boolean);
      if (filePaths.length > 0) {
        await supabase.storage.from("charlie-documents").remove(filePaths);
      }

      // Delete from database
      const ids = selectedDocs.map((d) => d.id);
      const { error } = await supabase.from("documents").delete().in("id", ids);
      if (error) throw error;

      setDocuments((prev) => prev.filter((d) => !selected.has(d.id)));
      setSelected(new Set());
    } catch (err) {
      console.error("Batch delete error:", err);
      alert("Failed to delete some documents: " + err.message);
    } finally {
      setBatchDeleting(false);
    }
  }

  function getFilteredDocuments() {
    let filtered = documents;

    if (categoryFilter !== "all") {
      filtered = filtered.filter((d) => d.category === categoryFilter);
    }

    if (tagFilter) {
      filtered = filtered.filter((d) => (d.tags || []).includes(tagFilter));
    }

    if (ragFilter === "indexed") {
      filtered = filtered.filter((d) => d.indexed_for_rag);
    } else if (ragFilter === "not-indexed") {
      filtered = filtered.filter((d) => !d.indexed_for_rag);
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (d) =>
          d.filename.toLowerCase().includes(q) ||
          (d.tags || []).some((t) => t.includes(q)),
      );
    }

    return filtered;
  }

  const filtered = getFilteredDocuments();

  // Collect all tags used across documents for the tag filter
  const usedTags = [...new Set(documents.flatMap((d) => d.tags || []))].sort();

  const selectedInView = filtered.filter((d) => selected.has(d.id)).length;
  const allFilteredSelected =
    filtered.length > 0 && filtered.every((d) => selected.has(d.id));

  return (
    <div className="doc-browser">
      <div className="filters">
        <div className="filter-group">
          <label>Category</label>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c === "all" ? "All Categories" : c}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label>Tag</label>
          <select
            value={tagFilter}
            onChange={(e) => setTagFilter(e.target.value)}
          >
            <option value="">All Tags</option>
            {usedTags.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label>RAG Status</label>
          <select
            value={ragFilter}
            onChange={(e) => setRagFilter(e.target.value)}
          >
            <option value="all">All</option>
            <option value="indexed">Indexed</option>
            <option value="not-indexed">Not Indexed</option>
          </select>
        </div>

        <div className="filter-group search">
          <label>Search</label>
          <input
            type="text"
            placeholder="Search documents..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="doc-summary">
        Showing {filtered.length} of {documents.length} documents
        {documents.filter((d) => d.indexed_for_rag).length > 0 && (
          <span className="doc-summary-rag">
            {" "}
            &middot; {documents.filter((d) => d.indexed_for_rag).length} indexed
            for RAG
          </span>
        )}
      </div>

      {/* Batch action bar */}
      <div className="batch-bar">
        <button
          className="btn-upload"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? "Uploading..." : "Upload Document"}
        </button>
        <input
          type="file"
          ref={fileInputRef}
          accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
          onChange={handleUpload}
          style={{ display: "none" }}
        />
        <label className="batch-select-all">
          <input
            type="checkbox"
            checked={allFilteredSelected}
            onChange={selectAllFiltered}
            disabled={filtered.length === 0}
          />
          Select all ({filtered.length})
        </label>
        {selected.size > 0 && (
          <div className="batch-actions">
            <span className="batch-count">{selected.size} selected</span>
            <button
              className="btn-batch-delete"
              onClick={handleBatchDelete}
              disabled={batchDeleting}
            >
              {batchDeleting
                ? "Deleting..."
                : `Delete ${selected.size} selected`}
            </button>
            <button
              className="btn-batch-clear"
              onClick={() => setSelected(new Set())}
            >
              Clear
            </button>
          </div>
        )}
      </div>

      {loading && <p className="loading">Loading documents...</p>}
      {error && <p className="error">Error: {error}</p>}

      {!loading && !error && filtered.length === 0 && (
        <p className="no-messages">No documents found</p>
      )}

      {!loading && !error && filtered.length > 0 && (
        <div className="doc-grid">
          {filtered.map((doc) => (
            <DocumentCard
              key={doc.id}
              document={doc}
              onUpdate={handleDocumentUpdate}
              onDelete={handleDocumentDelete}
              selected={selected.has(doc.id)}
              onToggleSelect={() => toggleSelect(doc.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
