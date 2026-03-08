"""
Charlie Tracker - PDF Text Extraction via Docling

Run this script ON the bfc-docling-serve server where Docling is running locally.
It downloads PDFs from Supabase Storage, extracts text via Docling, and updates
the documents table with the extracted content.

Setup on server:
    pip3 install requests

Usage:
    python3 extract_pdf_text.py                    # extract all PDFs without content_text
    python3 extract_pdf_text.py --doc-id <uuid>    # extract one specific document
    python3 extract_pdf_text.py --dry-run          # preview without updating
    python3 extract_pdf_text.py --list             # list documents needing extraction
"""

import argparse
import io
import json
import sys
import time

import requests

# --- Configuration ---
# Set these directly or via environment variables
SUPABASE_URL = "https://knqhcipfgypzfszrwrsu.supabase.co"
SUPABASE_SERVICE_KEY = ""  # FILL IN before running
DOCLING_URL = "http://localhost:5000"
DOCLING_API_KEY = ""  # FILL IN or use --docling-key

HEADERS = {}


def init_headers():
    global HEADERS
    HEADERS = {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Content-Type": "application/json",
    }


def get_documents_needing_extraction():
    """Fetch documents that have no content_text yet."""
    resp = requests.get(
        f"{SUPABASE_URL}/rest/v1/documents",
        headers=HEADERS,
        params={
            "select": "id,filename,file_path,source_type",
            "content_text": "is.null",
            "file_path": "not.is.null",
            "order": "filename.asc",
        },
    )
    resp.raise_for_status()
    docs = resp.json()
    # Only PDFs
    return [d for d in docs if d["filename"].lower().endswith(".pdf")]


def get_document_by_id(doc_id):
    """Fetch a single document by ID."""
    resp = requests.get(
        f"{SUPABASE_URL}/rest/v1/documents",
        headers=HEADERS,
        params={
            "select": "id,filename,file_path,source_type",
            "id": f"eq.{doc_id}",
        },
    )
    resp.raise_for_status()
    docs = resp.json()
    if not docs:
        print(f"[ERROR] Document {doc_id} not found")
        sys.exit(1)
    return docs[0]


def download_pdf(file_path, source_type):
    """Download PDF from Supabase Storage."""
    bucket = "charlie-attachments" if source_type == "email_attachment" else "charlie-documents"
    url = f"{SUPABASE_URL}/storage/v1/object/{bucket}/{file_path}"
    resp = requests.get(url, headers={
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
    })
    resp.raise_for_status()
    return resp.content


def extract_text_docling(pdf_bytes, filename):
    """Send PDF to Docling API for text extraction."""
    headers = {}
    if DOCLING_API_KEY:
        headers["X-API-Key"] = DOCLING_API_KEY
    resp = requests.post(
        f"{DOCLING_URL}/extract",
        files={"file": (filename, io.BytesIO(pdf_bytes), "application/pdf")},
        headers=headers,
        timeout=300,
    )
    resp.raise_for_status()
    data = resp.json()

    # Handle various Docling response formats
    if isinstance(data, dict):
        if "text" in data:
            return data["text"]
        if "content" in data:
            return data["content"]
        if "document" in data:
            doc = data["document"]
            if isinstance(doc, dict) and "text" in doc:
                return doc["text"]
            if isinstance(doc, str):
                return doc
        # Try markdown output
        if "markdown" in data:
            return data["markdown"]
        # Return full JSON as fallback
        return json.dumps(data, indent=2)

    return str(data)


def update_document_text(doc_id, content_text):
    """Update the document record with extracted text."""
    resp = requests.patch(
        f"{SUPABASE_URL}/rest/v1/documents",
        headers=HEADERS,
        params={"id": f"eq.{doc_id}"},
        json={"content_text": content_text},
    )
    resp.raise_for_status()


def check_docling():
    """Check if Docling is running."""
    try:
        resp = requests.get(f"{DOCLING_URL}/health", timeout=5)
        return resp.status_code == 200
    except Exception:
        return False


def main():
    parser = argparse.ArgumentParser(description="Extract PDF text via Docling")
    parser.add_argument("--doc-id", help="Extract text for a specific document ID")
    parser.add_argument("--dry-run", action="store_true", help="Preview without updating")
    parser.add_argument("--list", action="store_true", help="List documents needing extraction")
    parser.add_argument("--supabase-key", help="Supabase service key (or edit script)")
    parser.add_argument("--docling-url", help="Docling URL (default: http://localhost:5000)")
    parser.add_argument("--docling-key", help="Docling API key")
    args = parser.parse_args()

    global SUPABASE_SERVICE_KEY, DOCLING_URL, DOCLING_API_KEY
    if args.supabase_key:
        SUPABASE_SERVICE_KEY = args.supabase_key
    if args.docling_url:
        DOCLING_URL = args.docling_url
    if args.docling_key:
        DOCLING_API_KEY = args.docling_key

    if not SUPABASE_SERVICE_KEY:
        print("[ERROR] Supabase service key required. Use --supabase-key or edit the script.")
        sys.exit(1)

    init_headers()

    # List mode
    if args.list:
        docs = get_documents_needing_extraction()
        print(f"\n{len(docs)} documents need text extraction:\n")
        for d in docs:
            print(f"  {d['id'][:8]}...  {d['filename']}")
        return

    # Check Docling is up
    if not args.dry_run:
        print(f"Checking Docling at {DOCLING_URL}...")
        if not check_docling():
            print("[ERROR] Docling is not running. Start it first:")
            print("  docker start bfc-docling-serve  # or whatever the container name is")
            sys.exit(1)
        print("Docling is running.\n")

    # Get documents to process
    if args.doc_id:
        docs = [get_document_by_id(args.doc_id)]
    else:
        docs = get_documents_needing_extraction()

    if not docs:
        print("No documents need text extraction.")
        return

    print(f"Processing {len(docs)} documents...\n")

    success = 0
    failed = 0

    for i, doc in enumerate(docs, 1):
        filename = doc["filename"]
        print(f"[{i}/{len(docs)}] {filename}")

        if args.dry_run:
            print(f"  [DRY RUN] Would download from {doc['file_path']} and extract text")
            continue

        try:
            # Download PDF
            print(f"  Downloading from storage...", end=" ", flush=True)
            pdf_bytes = download_pdf(doc["file_path"], doc.get("source_type", "web_scrape"))
            print(f"{len(pdf_bytes):,} bytes")

            # Extract text
            print(f"  Extracting text via Docling...", end=" ", flush=True)
            start = time.time()
            text = extract_text_docling(pdf_bytes, filename)
            elapsed = time.time() - start
            print(f"{len(text):,} chars ({elapsed:.1f}s)")

            if not text or len(text.strip()) < 10:
                print(f"  [WARN] Extracted text is empty or too short, skipping update")
                failed += 1
                continue

            # Update database
            print(f"  Updating database...", end=" ", flush=True)
            update_document_text(doc["id"], text)
            print("done")

            success += 1

        except Exception as e:
            print(f"\n  [ERROR] {e}")
            failed += 1

    print(f"\nDone: {success} succeeded, {failed} failed out of {len(docs)} documents")


if __name__ == "__main__":
    main()
