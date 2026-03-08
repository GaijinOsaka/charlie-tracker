"""
Charlie Tracker - Auto-Tag Documents

Uses Claude Haiku to suggest tags and categories for documents
based on filename and source URL.

Usage:
    pip install anthropic
    python tag_documents.py              # tag all untagged documents
    python tag_documents.py --all        # re-tag all documents
    python tag_documents.py --dry-run    # preview without updating
"""

import argparse
import json
import os
import sys
import time

import requests
from anthropic import Anthropic
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")

AVAILABLE_TAGS = [
    "curriculum", "timetable", "term-dates", "newsletter", "policy",
    "safeguarding", "health", "meals", "uniform", "clubs",
    "homework", "reading", "sports", "music", "trips",
    "parents-evening", "report", "form", "letter", "archived",
]

CATEGORIES = ["academic", "admin", "events", "health", "pastoral", "general"]


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


def fetch_documents(only_untagged=True):
    """Fetch documents from Supabase."""
    path = "/rest/v1/documents?select=id,filename,source_url,tags,category,source_type"
    if only_untagged:
        path += "&tags=eq.{}"
    path += "&order=filename.asc"
    headers = {"Accept": "application/json"}
    resp = supabase_request("GET", path, headers=headers)
    return resp.json()


def suggest_tags(client, filename, source_url):
    """Use Claude Haiku to suggest tags and category for a document."""
    prompt = f"""Based on this school document, suggest 3-5 relevant tags and a category.

Document filename: {filename}
Source URL: {source_url or 'N/A'}

Available tags: {', '.join(AVAILABLE_TAGS)}
Available categories: {', '.join(CATEGORIES)}

Return ONLY valid JSON with no extra text:
{{"tags": ["tag1", "tag2", "tag3"], "category": "category_name"}}"""

    message = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=200,
        messages=[{"role": "user", "content": prompt}],
    )
    text = message.content[0].text.strip()

    # Strip markdown code blocks if present
    if text.startswith("```"):
        text = text.split("\n", 1)[1] if "\n" in text else text
        if text.endswith("```"):
            text = text[:-3]
        text = text.strip()

    # Parse JSON response
    try:
        result = json.loads(text)
        tags = [t for t in result.get("tags", []) if t in AVAILABLE_TAGS]
        category = result.get("category", "general")
        if category not in CATEGORIES:
            category = "general"
        return tags, category
    except json.JSONDecodeError:
        print(f"  [WARN] Failed to parse AI response: {text}")
        return [], "general"


def update_document(doc_id, tags, category):
    """Update document tags and category in Supabase."""
    supabase_request(
        "PATCH",
        f"/rest/v1/documents?id=eq.{doc_id}",
        json_data={"tags": tags, "category": category},
        headers={"Content-Type": "application/json", "Prefer": "return=minimal"},
    )


def main():
    parser = argparse.ArgumentParser(description="Auto-tag documents using Claude")
    parser.add_argument("--all", action="store_true", help="Re-tag all documents (not just untagged)")
    parser.add_argument("--dry-run", action="store_true", help="Preview without updating")
    args = parser.parse_args()

    if not ANTHROPIC_API_KEY:
        print("ERROR: ANTHROPIC_API_KEY not set in .env")
        sys.exit(1)

    client = Anthropic(api_key=ANTHROPIC_API_KEY)
    docs = fetch_documents(only_untagged=not args.all)

    print(f"Documents to tag: {len(docs)}")
    print(f"Dry run: {args.dry_run}")
    print()

    for i, doc in enumerate(docs):
        filename = doc["filename"]
        source_url = doc.get("source_url", "")
        print(f"[{i+1}/{len(docs)}] {filename}")

        tags, category = suggest_tags(client, filename, source_url)
        print(f"  Tags: {tags}")
        print(f"  Category: {category}")

        if not args.dry_run:
            update_document(doc["id"], tags, category)
            print(f"  Updated.")

        time.sleep(0.5)  # Rate limiting

    print(f"\nDone! Tagged {len(docs)} documents.")


if __name__ == "__main__":
    main()
