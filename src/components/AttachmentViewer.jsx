import React, { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import "./AttachmentViewer.css";

// Set up PDF.js worker with local bundled worker
// Fallback to CDN if worker URL is invalid
try {
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;
} catch (e) {
  // Fallback to CDN worker
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
}

export function AttachmentViewer({ attachment, isOpen, onClose }) {
  const [fileData, setFileData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [pdfPages, setPdfPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [error, setError] = useState(null);
  const [containerWidth, setContainerWidth] = useState(window.innerWidth);
  const pdfContainerRef = React.useRef(null);

  const isImage = attachment?.mime_type?.includes("image");
  const isPdf = attachment?.mime_type?.includes("pdf");

  // Measure actual container width when modal opens
  useEffect(() => {
    if (!isOpen || !pdfContainerRef.current) return;
    const updateWidth = () => {
      if (pdfContainerRef.current) {
        setContainerWidth(pdfContainerRef.current.clientWidth);
      }
    };
    // Measure after render
    setTimeout(updateWidth, 0);
    window.addEventListener("resize", updateWidth);
    return () => window.removeEventListener("resize", updateWidth);
  }, [isOpen]);

  // Fetch file from storage
  useEffect(() => {
    if (!isOpen || !attachment) return;

    const fetchFile = async () => {
      try {
        setLoading(true);
        setError(null);

        // Add timeout for slow mobile connections (30 seconds)
        const downloadPromise = supabase.storage
          .from("charlie-documents")
          .download(attachment.file_path);

        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error("Download timeout - slow connection")),
            30000,
          ),
        );

        const { data, error: fetchError } = await Promise.race([
          downloadPromise,
          timeoutPromise,
        ]);

        if (fetchError) throw fetchError;

        if (isImage) {
          const url = URL.createObjectURL(data);
          setFileData(url);
        } else if (isPdf) {
          try {
            const arrayBuffer = await data.arrayBuffer();
            const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
            setFileData(pdf);
            setPdfPages(pdf.numPages);
            setCurrentPage(1);
          } catch (pdfErr) {
            console.error("PDF processing error:", pdfErr);
            throw new Error(
              "Failed to process PDF. Try refreshing or use desktop view.",
            );
          }
        }
      } catch (err) {
        console.error("Error loading attachment:", err);
        setError(err.message || "Failed to load file");
      } finally {
        setLoading(false);
      }
    };

    fetchFile();
  }, [isOpen, attachment, isImage, isPdf]);

  // Handle keyboard close
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === "Escape" && isOpen) onClose();
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="attachment-viewer-overlay" onClick={onClose}>
      <div
        className="attachment-viewer-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <button className="viewer-close-btn" onClick={onClose}>
          ✕
        </button>

        {loading && <div className="viewer-loading">Loading...</div>}
        {error && <div className="viewer-error">{error}</div>}

        {isImage && fileData && (
          <div className="viewer-image">
            <img src={fileData} alt={attachment.filename} />
          </div>
        )}

        {isPdf && fileData && (
          <div className="viewer-pdf" ref={pdfContainerRef}>
            <PDFPage
              pdf={fileData}
              pageNum={currentPage}
              containerWidth={containerWidth}
            />
            <div className="pdf-controls">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              >
                ← Previous
              </button>
              <span>
                {currentPage} / {pdfPages}
              </span>
              <button
                disabled={currentPage === pdfPages}
                onClick={() =>
                  setCurrentPage(Math.min(pdfPages, currentPage + 1))
                }
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
function PDFPage({ pdf, pageNum, containerWidth }) {
  const [imageUrl, setImageUrl] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const renderPage = async () => {
      try {
        const page = await pdf.getPage(pageNum);
        // Get page viewport at scale 1 to know its natural width
        const baseViewport = page.getViewport({ scale: 1 });
        // Calculate CSS-pixel scale to fit container width (padding: 8px mobile, 20px desktop)
        const padding = window.innerWidth < 480 ? 16 : 40;
        const availableWidth = (containerWidth || window.innerWidth) - padding;
        const cssScale = availableWidth / baseViewport.width;
        // Render at device-pixel scale so canvas pixels map 1:1 to physical pixels
        // on HiDPI/Retina screens. Cap to avoid OOM on huge pages.
        const dpr = window.devicePixelRatio || 1;
        const renderScale = Math.min(cssScale * dpr, 6);

        const viewport = page.getViewport({ scale: renderScale });
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        await page.render({
          canvasContext: canvas.getContext("2d"),
          viewport: viewport,
        }).promise;

        setImageUrl(canvas.toDataURL());
        setError(null);
      } catch (err) {
        console.error("Error rendering PDF page:", err);
        setError("Failed to render page");
      }
    };

    renderPage();
  }, [pdf, pageNum, containerWidth]);

  if (error)
    return (
      <div style={{ color: "var(--danger)", padding: "20px" }}>{error}</div>
    );
  return imageUrl ? (
    <img src={imageUrl} alt="PDF page" className="pdf-page" />
  ) : (
    <div>Rendering...</div>
  );
}
