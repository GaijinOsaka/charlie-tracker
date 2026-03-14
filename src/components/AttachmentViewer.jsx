import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import * as pdfjsLib from 'pdfjs-dist';
import './AttachmentViewer.css';

// Set up PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

export function AttachmentViewer({ attachment, isOpen, onClose }) {
  const [fileData, setFileData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [pdfPages, setPdfPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [error, setError] = useState(null);

  const isImage = attachment?.mime_type?.includes('image');
  const isPdf = attachment?.mime_type?.includes('pdf');

  // Fetch file from storage
  useEffect(() => {
    if (!isOpen || !attachment) return;

    const fetchFile = async () => {
      try {
        setLoading(true);
        setError(null);
        const { data, error: fetchError } = await supabase.storage
          .from('charlie-documents')
          .download(attachment.file_path);

        if (fetchError) throw fetchError;

        if (isImage) {
          const url = URL.createObjectURL(data);
          setFileData(url);
        } else if (isPdf) {
          const arrayBuffer = await data.arrayBuffer();
          const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
          setFileData(pdf);
          setPdfPages(pdf.numPages);
          setCurrentPage(1);
        }
      } catch (err) {
        console.error('Error loading attachment:', err);
        setError('Failed to load file');
      } finally {
        setLoading(false);
      }
    };

    fetchFile();
  }, [isOpen, attachment, isImage, isPdf]);

  // Handle keyboard close
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="attachment-viewer-overlay" onClick={onClose}>
      <div className="attachment-viewer-modal" onClick={(e) => e.stopPropagation()}>
        <button className="viewer-close-btn" onClick={onClose}>✕</button>

        {loading && <div className="viewer-loading">Loading...</div>}
        {error && <div className="viewer-error">{error}</div>}

        {isImage && fileData && (
          <div className="viewer-image">
            <img src={fileData} alt={attachment.filename} />
          </div>
        )}

        {isPdf && fileData && (
          <div className="viewer-pdf">
            <PDFPage pdf={fileData} pageNum={currentPage} />
            <div className="pdf-controls">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              >
                ← Previous
              </button>
              <span>{currentPage} / {pdfPages}</span>
              <button
                disabled={currentPage === pdfPages}
                onClick={() => setCurrentPage(Math.min(pdfPages, currentPage + 1))}
              >
                Next →
              </button>
            </div>
          </div>
        )}

        <div className="viewer-filename">{attachment.filename}</div>
      </div>
    </div>
  );
}

// PDF page renderer component
function PDFPage({ pdf, pageNum }) {
  const [imageUrl, setImageUrl] = useState(null);

  useEffect(() => {
    pdf.getPage(pageNum).then((page) => {
      const viewport = page.getViewport({ scale: 2 });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;

      page.render({
        canvasContext: canvas.getContext('2d'),
        viewport: viewport,
      }).promise.then(() => {
        setImageUrl(canvas.toDataURL());
      });
    });
  }, [pdf, pageNum]);

  return imageUrl ? <img src={imageUrl} alt="PDF page" className="pdf-page" /> : <div>Rendering...</div>;
}
