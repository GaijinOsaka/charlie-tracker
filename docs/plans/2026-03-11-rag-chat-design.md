# RAG Chat ("Ask Charlie") Design

**Goal:** Add a floating chat drawer that lets the user ask questions about indexed school documents, powered by Claude and vector search.

**Architecture:** Edge Function handles embedding + search + LLM. React drawer component provides the UI overlay.

---

## Edge Function: `rag-chat`

- `verify_jwt: false` (matches extract-dates pattern)
- Input: `{ question, history: [{role, content}] }`
- Flow:
  1. Embed question via OpenAI `text-embedding-3-small`
  2. Call `search_knowledge_base()` RPC — top 5 chunks
  3. Build Claude messages request with system prompt + chunks as context + conversation history
  4. Return `{ answer, sources: [{filename, content}] }`
- System prompt: "You are Charlie, a helpful assistant for a parent tracking their child's school communications. Answer using only the provided document excerpts. Cite which document your answer comes from. If the documents don't contain the answer, say so."
- Uses Anthropic API (Claude) — key needs adding to Edge Function secrets

## React Component: `ChatDrawer`

- Floating button bottom-right, always visible, "Ask Charlie"
- Drawer slides in from right (~400px wide, full height)
- Messages: user (blue, right-aligned), assistant (grey, left-aligned)
- Source citations shown as chips below each assistant message
- Text input + send button at bottom, typing indicator while loading
- State: in-component only (messages array, loading, isOpen). No persistence.
- Overlay style — doesn't push main content

## Secrets Required

- `ANTHROPIC_API_KEY` in Supabase Edge Function secrets
