import React, { useState } from 'react'
import { supabase } from '../lib/supabase'
import TagEditor from './TagEditor'

const CATEGORY_COLORS = {
  academic: { bg: '#dbeafe', color: '#1e40af' },
  admin: { bg: '#fef3c7', color: '#92400e' },
  events: { bg: '#d1fae5', color: '#065f46' },
  health: { bg: '#fee2e2', color: '#991b1b' },
  pastoral: { bg: '#ede9fe', color: '#5b21b6' },
  general: { bg: '#f3f4f6', color: '#374151' },
  other: { bg: '#f3f4f6', color: '#374151' },
}

export default function DocumentCard({ document, onUpdate, onDelete, selected, onToggleSelect }) {
  const [downloading, setDownloading] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [indexing, setIndexing] = useState(false)
  const [extractingText, setExtractingText] = useState(false)
  const [extractingDates, setExtractingDates] = useState(false)

  const tags = document.tags || []
  const categoryStyle = CATEGORY_COLORS[document.category] || CATEGORY_COLORS.other

  async function handleDownload() {
    setDownloading(true)
    try {
      const { data, error } = await supabase.storage
        .from('charlie-documents')
        .createSignedUrl(document.file_path, 3600)

      if (error) throw error
      window.open(data.signedUrl, '_blank')
    } catch (err) {
      console.error('Download error:', err)
    } finally {
      setDownloading(false)
    }
  }

  async function toggleRagFlag() {
    const action = document.indexed_for_rag ? 'remove' : 'index'
    setIndexing(true)
    try {
      const { data, error } = await supabase.functions.invoke('index-document', {
        body: { doc_id: document.id, action },
      })

      if (error) {
        let msg = error.message
        try {
          if (error.context && typeof error.context.json === 'function') {
            const body = await error.context.json()
            msg = body.error || msg
          }
        } catch (_) {}
        throw new Error(msg)
      }
      if (data && !data.success) throw new Error(data.error || 'Indexing failed')

      if (data?.status === 'extracting') {
        alert(data.message || 'PDF text extraction started. This takes 2-3 minutes. The document will be indexed automatically.')
        return
      }

      if (onUpdate) {
        onUpdate({ ...document, indexed_for_rag: action === 'index' })
      }
    } catch (err) {
      console.error('RAG toggle error:', err)
      alert(`Failed to ${action} document: ${err.message}`)
    } finally {
      setIndexing(false)
    }
  }

  async function handleDelete() {
    if (!window.confirm(`Delete "${document.filename}"? This will remove the file from storage and the database.`)) {
      return
    }
    setDeleting(true)
    try {
      // Delete from storage
      if (document.file_path) {
        await supabase.storage.from('charlie-documents').remove([document.file_path])
      }
      // Delete from database (cascades to document_chunks)
      const { error } = await supabase.from('documents').delete().eq('id', document.id)
      if (error) throw error
      if (onDelete) onDelete(document.id)
    } catch (err) {
      console.error('Delete error:', err)
      alert('Failed to delete document: ' + err.message)
      setDeleting(false)
    }
  }

  async function handleExtractText() {
    setExtractingText(true)
    try {
      const { data, error } = await supabase.functions.invoke('index-document', {
        body: { doc_id: document.id, action: 'index' },
      })

      if (error) {
        let msg = error.message
        try {
          if (error.context && typeof error.context.json === 'function') {
            const body = await error.context.json()
            msg = body.error || msg
          }
        } catch (_) {}
        throw new Error(msg)
      }
      if (data && !data.success) throw new Error(data.error || 'Extraction failed')

      if (data?.status === 'extracting') {
        alert(data.message || 'Text extraction started. This takes 2-3 minutes.')
      }
    } catch (err) {
      console.error('Extract text error:', err)
      alert('Failed to extract text: ' + err.message)
    } finally {
      setExtractingText(false)
    }
  }

  async function handleExtractDates() {
    setExtractingDates(true)
    try {
      const { data, error } = await supabase.functions.invoke('extract-dates', {
        body: { document_id: document.id },
      })

      if (error) {
        let msg = error.message
        try {
          if (error.context && typeof error.context.json === 'function') {
            const body = await error.context.json()
            msg = body.error || msg
          }
        } catch (_) {}
        throw new Error(msg)
      }
      if (data && !data.success) throw new Error(data.error || 'Date extraction failed')

      const count = data?.events_created || 0
      alert(`Date extraction complete. ${count} event${count !== 1 ? 's' : ''} created.`)

      if (onUpdate) {
        onUpdate({ ...document, dates_extracted: true })
      }
    } catch (err) {
      console.error('Extract dates error:', err)
      alert('Failed to extract dates: ' + err.message)
    } finally {
      setExtractingDates(false)
    }
  }

  return (
    <div className={`doc-card ${selected ? 'doc-card-selected' : ''}`}>
      <div className="doc-card-header">
        <input
          type="checkbox"
          className="doc-checkbox"
          checked={!!selected}
          onChange={onToggleSelect}
        />
        <span className="doc-icon">
          {document.filename?.endsWith('.pdf') ? '\u{1F4C4}' : '\u{1F4CE}'}
        </span>
        <h4 className="doc-filename" title={document.filename}>
          {document.filename}
        </h4>
      </div>

      <div className="doc-card-meta">
        <span
          className="doc-category-badge"
          style={{ background: categoryStyle.bg, color: categoryStyle.color }}
        >
          {document.category || 'other'}
        </span>
        <span className={`doc-rag-badge ${document.indexed_for_rag ? 'rag-yes' : 'rag-no'}`}>
          {document.indexed_for_rag ? '\u26A1 Indexed' : '\u{1F512} Not Indexed'}
        </span>
        {document.content_text && (
          <span className="doc-text-badge">Text Extracted</span>
        )}
        {document.dates_extracted && (
          <span className="doc-dates-badge">Dates Extracted</span>
        )}
      </div>

      {tags.length > 0 && (
        <div className="doc-tags">
          {tags.slice(0, 4).map(tag => (
            <span key={tag} className="doc-tag">{tag}</span>
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
          {downloading ? 'Opening...' : 'Download'}
        </button>
        {!document.content_text && (
          <button
            className="btn-doc btn-extract-text"
            onClick={handleExtractText}
            disabled={extractingText}
          >
            {extractingText ? 'Extracting...' : 'Extract Text'}
          </button>
        )}
        <button
          className={`btn-doc ${document.indexed_for_rag ? 'btn-remove-rag' : 'btn-add-rag'}`}
          onClick={toggleRagFlag}
          disabled={indexing || !document.content_text}
          title={!document.content_text ? 'Extract text first' : undefined}
        >
          {indexing
            ? (document.indexed_for_rag ? 'Removing...' : 'Indexing...')
            : (document.indexed_for_rag ? 'Remove from RAG' : 'Add to RAG')}
        </button>
        {document.content_text && (
          <button
            className="btn-doc btn-extract-dates"
            onClick={handleExtractDates}
            disabled={extractingDates}
          >
            {extractingDates
              ? 'Extracting...'
              : (document.dates_extracted ? 'Re-extract Dates' : 'Extract Dates')}
          </button>
        )}
        <button
          className="btn-doc btn-delete"
          onClick={handleDelete}
          disabled={deleting}
        >
          {deleting ? 'Deleting...' : 'Delete'}
        </button>
      </div>

      <TagEditor document={document} onUpdate={onUpdate} />
    </div>
  )
}
