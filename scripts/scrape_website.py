"""
Charlie Tracker - School Website Scraper & RAG Ingestion

Scrapes school website pages, extracts text + PDFs, generates embeddings,
and stores in Supabase (pgvector) for RAG search.

Usage:
    pip install -r requirements.txt
    cp .env.example .env  # fill in credentials
    python scrape_website.py                    # scrape all pages
    python scrape_website.py --page /class-5/   # scrape one page
    python scrape_website.py --dry-run          # preview without inserting
"""

import argparse
import hashlib
import io
import os
import sys
import time
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

# Config
SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
OPENAI_API_KEY = os.environ["OPENAI_API_KEY"]
DOCLING_URL = os.environ.get("DOCLING_URL", "http://139.59.165.79:5000")

BASE_URL = "https://www.archbishopcranmer.co.uk"
TARGET_PAGES = [
    "/class-5/",
    "/term-dates-and-school-day-timings/",
    "/topic/parents",
]

# Parents hub sub-pages to crawl (under /topic/parents or /parents/ paths)
PARENT_HUB_SECTIONS = [
    "About Us", "Key Information", "News & Events", "Parents", "Children"
]

openai_client = OpenAI(api_key=OPENAI_API_KEY)

# --- Supabase helpers ---

def supabase_request(method, path, json=None, data=None, headers=None):
    """Make authenticated request to Supabase REST API."""
    url = f"{SUPABASE_URL}{path}"
    default_headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
    }
    if headers:
        default_headers.update(headers)
    resp = requests.request(method, url, json=json, data=data, headers=default_headers)
    resp.raise_for_status()
    return resp


def upsert_web_page(url, title, content, embedding):
    """Insert or update a web page record."""
    content_hash = hashlib.md5(content.encode()).hexdigest()
    row = {
        "url": url,
        "title": title,
        "content": content,
        "content_hash": content_hash,
        "embedding": embedding,
        "last_scraped_at": "now()",
    }
    resp = supabase_request(
        "POST",
        "/rest/v1/web_pages?on_conflict=url",
        json=row,
        headers={
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates",
        },
    )
    print(f"  [DB] Upserted web_page: {url}")
    return resp


def insert_document(source_url, filename, file_path, content_text, embedding, source_type="web_scrape"):
    """Insert a document record."""
    row = {
        "source_url": source_url,
        "filename": filename,
        "file_path": file_path,
        "content_text": content_text,
        "embedding": embedding,
        "source_type": source_type,
    }
    resp = supabase_request(
        "POST",
        "/rest/v1/documents",
        json=row,
        headers={"Content-Type": "application/json"},
    )
    print(f"  [DB] Inserted document: {filename}")
    return resp


def upload_to_storage(file_bytes, storage_path, mime_type="application/pdf"):
    """Upload file to Supabase Storage charlie-documents bucket."""
    resp = supabase_request(
        "POST",
        f"/storage/v1/object/charlie-documents/{storage_path}",
        data=file_bytes,
        headers={"Content-Type": mime_type, "x-upsert": "true"},
    )
    print(f"  [Storage] Uploaded: {storage_path}")
    return resp


# --- Scraping helpers ---

def fetch_page(url):
    """Fetch a page and return BeautifulSoup object."""
    print(f"  [Fetch] {url}")
    resp = requests.get(url, timeout=30, headers={
        "User-Agent": "Mozilla/5.0 (Charlie Tracker Bot)"
    })
    resp.raise_for_status()
    return BeautifulSoup(resp.text, "html.parser")


def extract_content(soup):
    """Extract main content text, stripping nav/footer/sidebar."""
    # Remove navigation, footer, sidebar, scripts, styles
    for tag in soup.find_all(["nav", "footer", "script", "style", "noscript"]):
        tag.decompose()

    # Try to find main content area
    main = (
        soup.find("main")
        or soup.find("article")
        or soup.find("div", class_="entry-content")
        or soup.find("div", class_="content-area")
        or soup.find("div", id="content")
        or soup.find("div", class_="page-content")
    )

    if main:
        # Remove sidebar if inside main
        for sidebar in main.find_all(["aside", "div"], class_=lambda c: c and "sidebar" in c.lower() if c else False):
            sidebar.decompose()
        text = main.get_text(separator="\n", strip=True)
    else:
        # Fallback: get body text
        body = soup.find("body")
        text = body.get_text(separator="\n", strip=True) if body else ""

    # Clean up excessive whitespace
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    return "\n".join(lines)


def find_pdfs(soup, page_url):
    """Find all PDF and document links on the page."""
    docs = []
    for link in soup.find_all("a", href=True):
        href = link["href"]
        lower = href.lower()
        if lower.endswith(".pdf") or lower.endswith(".docx") or lower.endswith(".doc"):
            full_url = urljoin(page_url, href)
            filename = os.path.basename(urlparse(full_url).path)
            docs.append({"url": full_url, "filename": filename})
    return docs


def find_sub_pages(soup, page_url):
    """Find sub-page links from a hub/topic page."""
    sub_pages = []
    seen = set()
    for link in soup.find_all("a", href=True):
        href = link["href"]
        full_url = urljoin(page_url, href)
        parsed = urlparse(full_url)

        # Only follow links within the same domain
        if parsed.netloc and parsed.netloc != urlparse(BASE_URL).netloc:
            continue

        # Skip anchors, external, media files
        if href.startswith("#") or href.startswith("mailto:") or href.startswith("tel:"):
            continue
        if any(href.lower().endswith(ext) for ext in [".pdf", ".docx", ".doc", ".jpg", ".png", ".gif"]):
            continue

        # Only crawl pages under the parents section or linked from the hub
        path = parsed.path.rstrip("/")
        if path and path != urlparse(page_url).path.rstrip("/") and full_url not in seen:
            # Filter to school domain paths that look like content pages
            if parsed.netloc == urlparse(BASE_URL).netloc or not parsed.netloc:
                seen.add(full_url)
                sub_pages.append(full_url)

    return sub_pages


# --- Docling ---

def extract_pdf_text_docling(pdf_bytes, filename):
    """Send PDF to Docling API for text extraction."""
    try:
        resp = requests.post(
            f"{DOCLING_URL}/convert",
            files={"file": (filename, io.BytesIO(pdf_bytes), "application/pdf")},
            timeout=120,
        )
        resp.raise_for_status()
        result = resp.json()
        # Docling returns markdown or text in various formats
        text = result.get("text", "") or result.get("markdown", "") or result.get("content", "")
        if not text and isinstance(result, dict):
            # Try to extract from nested structure
            for key in ["document", "output", "result"]:
                if key in result:
                    nested = result[key]
                    if isinstance(nested, str):
                        text = nested
                        break
                    elif isinstance(nested, dict):
                        text = nested.get("text", "") or nested.get("markdown", "")
                        if text:
                            break
        print(f"  [Docling] Extracted {len(text)} chars from {filename}")
        return text
    except Exception as e:
        print(f"  [Docling] FAILED for {filename}: {e}")
        return ""


def extract_pdf_text_fallback(pdf_bytes, filename):
    """Fallback: skip text extraction if Docling unavailable."""
    print(f"  [Docling] Unavailable, skipping text extraction for {filename}")
    return ""


# --- Embeddings ---

def generate_embedding(text):
    """Generate embedding via OpenAI text-embedding-3-small."""
    if not text or len(text.strip()) < 10:
        return None

    # Truncate to ~8000 tokens (~32000 chars) for embedding model limits
    truncated = text[:32000]
    try:
        resp = openai_client.embeddings.create(
            model="text-embedding-3-small",
            input=truncated,
        )
        return resp.data[0].embedding
    except Exception as e:
        print(f"  [Embedding] FAILED: {e}")
        return None


# --- Main pipeline ---

def process_page(url, dry_run=False):
    """Scrape a single page: extract content, find PDFs, generate embeddings, store."""
    print(f"\n{'='*60}")
    print(f"Processing: {url}")
    print(f"{'='*60}")

    soup = fetch_page(url)
    title = soup.title.string.strip() if soup.title and soup.title.string else url
    content = extract_content(soup)
    pdfs = find_pdfs(soup, url)

    print(f"  Title: {title}")
    print(f"  Content: {len(content)} chars")
    print(f"  PDFs found: {len(pdfs)}")

    if dry_run:
        print("  [DRY RUN] Would insert web_page and process PDFs")
        for pdf in pdfs:
            print(f"    - {pdf['filename']} ({pdf['url']})")
        return {"url": url, "title": title, "content_len": len(content), "pdfs": len(pdfs)}

    # Generate embedding for page content
    embedding = generate_embedding(content)

    # Upsert web page
    upsert_web_page(url, title, content, embedding)

    # Process PDFs
    for pdf_info in pdfs:
        try:
            print(f"\n  Processing PDF: {pdf_info['filename']}")
            pdf_resp = requests.get(pdf_info["url"], timeout=60)
            pdf_resp.raise_for_status()
            pdf_bytes = pdf_resp.content

            # Upload to Supabase Storage
            storage_path = f"web_scrape/{pdf_info['filename']}"
            upload_to_storage(pdf_bytes, storage_path)

            # Extract text via Docling
            try:
                pdf_text = extract_pdf_text_docling(pdf_bytes, pdf_info["filename"])
            except Exception:
                pdf_text = extract_pdf_text_fallback(pdf_bytes, pdf_info["filename"])

            # Generate embedding for PDF content
            pdf_embedding = generate_embedding(pdf_text) if pdf_text else None

            # Insert document record
            insert_document(
                source_url=pdf_info["url"],
                filename=pdf_info["filename"],
                file_path=storage_path,
                content_text=pdf_text,
                embedding=pdf_embedding,
            )
        except Exception as e:
            print(f"  [ERROR] Failed to process PDF {pdf_info['filename']}: {e}")

    return {"url": url, "title": title, "content_len": len(content), "pdfs": len(pdfs)}


def process_parent_hub(url, dry_run=False, max_sub_pages=20):
    """Process the parents hub page and crawl its sub-pages."""
    print(f"\n{'#'*60}")
    print(f"Processing hub: {url}")
    print(f"{'#'*60}")

    soup = fetch_page(url)
    sub_pages = find_sub_pages(soup, url)

    # Filter to likely content pages (not too many)
    sub_pages = sub_pages[:max_sub_pages]
    print(f"  Found {len(sub_pages)} sub-pages to crawl")

    # Process the hub page itself
    process_page(url, dry_run=dry_run)

    # Process each sub-page
    results = []
    for i, sub_url in enumerate(sub_pages):
        print(f"\n  --- Sub-page {i+1}/{len(sub_pages)} ---")
        try:
            result = process_page(sub_url, dry_run=dry_run)
            results.append(result)
            time.sleep(1)  # Be polite
        except Exception as e:
            print(f"  [ERROR] Failed to process {sub_url}: {e}")

    return results


def main():
    parser = argparse.ArgumentParser(description="Scrape school website for RAG ingestion")
    parser.add_argument("--page", help="Scrape a specific page path (e.g. /class-5/)")
    parser.add_argument("--dry-run", action="store_true", help="Preview without inserting data")
    parser.add_argument("--no-docling", action="store_true", help="Skip Docling PDF extraction")
    args = parser.parse_args()

    if args.no_docling:
        global extract_pdf_text_docling
        extract_pdf_text_docling = extract_pdf_text_fallback

    if args.page:
        pages = [args.page]
    else:
        pages = TARGET_PAGES

    print(f"Charlie Tracker - Website Scraper")
    print(f"Pages to process: {len(pages)}")
    print(f"Dry run: {args.dry_run}")
    print()

    for page_path in pages:
        url = urljoin(BASE_URL, page_path)

        if "/topic/" in page_path:
            process_parent_hub(url, dry_run=args.dry_run)
        else:
            process_page(url, dry_run=args.dry_run)

        time.sleep(1)  # Be polite between pages

    print(f"\n{'='*60}")
    print("Done!")


if __name__ == "__main__":
    main()
