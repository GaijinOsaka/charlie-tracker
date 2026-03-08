"""
Charlie Tracker - Document RAG Indexing

Chunks document text, generates embeddings, and stores in document_chunks
for vector search. Also supports removing and re-indexing.

Usage:
    python index_document.py --index <doc_id>     # index a single document
    python index_document.py --remove <doc_id>     # remove from RAG
    python index_document.py --reindex <doc_id>    # re-index a document
    python index_document.py --batch               # index all with content_text
    python index_document.py --list                # list documents and RAG status
"""

import argparse
import os
import sys
import time

import requests
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
OPENAI_API_KEY = os.environ["OPENAI_API_KEY"]

CHUNK_SIZE = 800
CHUNK_OVERLAP = 100

openai_client = OpenAI(api_key=OPENAI_API_KEY)


def supabase_request(method, path, json_data=None, headers=None):
    """Make authenticated request to Supabase REST API."""
    url = f"{SUPABASE_URL}{path}"
    default_headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
    }
    if headers:
        default_headers.update(headers)
    resp = requests.request(method, url, json=json_data, headers=default_headers)
    resp.raise_for_status()
    return resp


def chunk_text(text, chunk_size=CHUNK_SIZE, overlap=CHUNK_OVERLAP):
    """Split text into overlapping chunks."""
    chunks = []
    start = 0
    while start < len(text):
        end = start + chunk_size
        chunk = text[start:end]
        if chunk.strip():
            chunks.append({
                "content": chunk.strip(),
                "char_start": start,
                "char_end": min(end, len(text)),
            })
        start += chunk_size - overlap
    return chunks


def generate_embedding(text):
    """Generate embedding via OpenAI text-embedding-3-small."""
    if not text or len(text.strip()) < 10:
        return None
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


def get_document(doc_id):
    """Fetch a single document by ID."""
    resp = supabase_request(
        "GET",
        f"/rest/v1/documents?id=eq.{doc_id}&select=*",
        headers={"Accept": "application/json"},
    )
    docs = resp.json()
    return docs[0] if docs else None


def index_document(doc_id):
    """Chunk document text, generate embeddings, insert chunks."""
    doc = get_document(doc_id)
    if not doc:
        print(f"ERROR: Document {doc_id} not found")
        return False

    print(f"Indexing: {doc['filename']}")
    content = doc.get("content_text", "")
    if not content or len(content.strip()) < 20:
        print(f"  SKIP: No content_text (needs Docling extraction first)")
        return False

    chunks = chunk_text(content)
    print(f"  Chunks: {len(chunks)}")

    for i, chunk in enumerate(chunks):
        print(f"  Embedding chunk {i+1}/{len(chunks)}...", end=" ")
        embedding = generate_embedding(chunk["content"])
        if not embedding:
            print("FAILED")
            continue

        row = {
            "document_id": doc_id,
            "chunk_index": i,
            "content": chunk["content"],
            "embedding": embedding,
            "char_start": chunk["char_start"],
            "char_end": chunk["char_end"],
        }
        supabase_request(
            "POST",
            "/rest/v1/document_chunks",
            json_data=row,
            headers={"Content-Type": "application/json", "Prefer": "return=minimal"},
        )
        print("OK")
        time.sleep(0.2)

    # Mark as indexed
    supabase_request(
        "PATCH",
        f"/rest/v1/documents?id=eq.{doc_id}",
        json_data={"indexed_for_rag": True, "last_indexed_at": "now()"},
        headers={"Content-Type": "application/json", "Prefer": "return=minimal"},
    )
    print(f"  Done! {len(chunks)} chunks indexed.")
    return True


def remove_from_rag(doc_id):
    """Delete all chunks and reset indexed flag."""
    doc = get_document(doc_id)
    if not doc:
        print(f"ERROR: Document {doc_id} not found")
        return False

    print(f"Removing from RAG: {doc['filename']}")

    # Delete chunks
    supabase_request(
        "DELETE",
        f"/rest/v1/document_chunks?document_id=eq.{doc_id}",
    )

    # Reset flag
    supabase_request(
        "PATCH",
        f"/rest/v1/documents?id=eq.{doc_id}",
        json_data={"indexed_for_rag": False, "last_indexed_at": None},
        headers={"Content-Type": "application/json", "Prefer": "return=minimal"},
    )
    print(f"  Done! Chunks deleted, indexed_for_rag = false.")
    return True


def list_documents():
    """List all documents with RAG status."""
    resp = supabase_request(
        "GET",
        "/rest/v1/documents?select=id,filename,category,tags,indexed_for_rag,source_type&order=filename.asc",
        headers={"Accept": "application/json"},
    )
    docs = resp.json()
    print(f"{'Filename':<50} {'Category':<12} {'RAG':<5} {'Tags'}")
    print("-" * 100)
    for doc in docs:
        rag = "YES" if doc.get("indexed_for_rag") else "no"
        tags = ", ".join(doc.get("tags", []))
        print(f"{doc['filename'][:49]:<50} {doc.get('category', 'other'):<12} {rag:<5} {tags}")
    print(f"\nTotal: {len(docs)} documents")


def batch_index():
    """Index all documents that have content_text but aren't indexed."""
    resp = supabase_request(
        "GET",
        "/rest/v1/documents?indexed_for_rag=eq.false&content_text=not.is.null&select=id,filename",
        headers={"Accept": "application/json"},
    )
    docs = resp.json()
    # Filter to docs with actual content
    docs = [d for d in docs if d.get("filename")]

    print(f"Documents to index: {len(docs)}")
    indexed = 0
    for doc in docs:
        if index_document(doc["id"]):
            indexed += 1
        time.sleep(0.5)

    print(f"\nDone! Indexed {indexed}/{len(docs)} documents.")


def main():
    parser = argparse.ArgumentParser(description="Document RAG indexing")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--index", metavar="DOC_ID", help="Index a single document")
    group.add_argument("--remove", metavar="DOC_ID", help="Remove document from RAG")
    group.add_argument("--reindex", metavar="DOC_ID", help="Re-index a document")
    group.add_argument("--batch", action="store_true", help="Index all unindexed documents with content")
    group.add_argument("--list", action="store_true", help="List documents with RAG status")
    args = parser.parse_args()

    if args.index:
        index_document(args.index)
    elif args.remove:
        remove_from_rag(args.remove)
    elif args.reindex:
        remove_from_rag(args.reindex)
        index_document(args.reindex)
    elif args.batch:
        batch_index()
    elif args.list:
        list_documents()


if __name__ == "__main__":
    main()
