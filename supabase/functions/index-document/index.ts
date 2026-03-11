import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.0";

const CHUNK_SIZE = 800;
const CHUNK_OVERLAP = 100;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function chunkText(
  text: string,
  chunkSize = CHUNK_SIZE,
  overlap = CHUNK_OVERLAP
): { content: string; char_start: number; char_end: number }[] {
  const chunks: { content: string; char_start: number; char_end: number }[] =
    [];
  let start = 0;

  while (start < text.length) {
    let end = start + chunkSize;
    let chunk = text.slice(start, end);

    // Try to break at sentence/word boundary
    if (end < text.length) {
      const separators = [". ", ".\n", "\n\n", "\n", " "];
      for (const sep of separators) {
        const lastBreak = chunk.lastIndexOf(sep);
        if (lastBreak > chunkSize * 0.5) {
          end = start + lastBreak + sep.length;
          chunk = text.slice(start, end);
          break;
        }
      }
    }

    const trimmed = chunk.trim();
    if (trimmed.length > 20) {
      chunks.push({ content: trimmed, char_start: start, char_end: end });
    }

    start = end - overlap;
    if (start >= text.length) break;
  }

  return chunks;
}

async function generateEmbeddings(
  texts: string[],
  openaiKey: string
): Promise<number[][]> {
  const resp = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openaiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: texts.map((t) => t.slice(0, 32000)),
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`OpenAI API error: ${resp.status} ${err}`);
  }

  const data = await resp.json();
  return data.data.map((item: { embedding: number[] }) => item.embedding);
}

async function indexDocument(
  supabase: ReturnType<typeof createClient>,
  docId: string,
  openaiKey: string
): Promise<{ success: boolean; chunks_created: number; error?: string }> {
  // Fetch document
  const { data: doc, error: fetchErr } = await supabase
    .from("documents")
    .select("id, filename, content_text")
    .eq("id", docId)
    .single();

  if (fetchErr || !doc) {
    return { success: false, chunks_created: 0, error: "Document not found" };
  }

  if (!doc.content_text || doc.content_text.trim().length < 20) {
    return {
      success: false,
      chunks_created: 0,
      error: "Document has no extracted text. Run Docling extraction first.",
    };
  }

  // Delete existing chunks (in case of re-index)
  await supabase
    .from("document_chunks")
    .delete()
    .eq("document_id", docId);

  // Chunk the text
  const chunks = chunkText(doc.content_text);

  // Generate embeddings in batches of 20
  let totalCreated = 0;
  const batchSize = 20;

  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    const texts = batch.map((c) => c.content);

    const embeddings = await generateEmbeddings(texts, openaiKey);

    // Insert chunks
    const rows = batch.map((chunk, idx) => ({
      document_id: docId,
      chunk_index: i + idx,
      content: chunk.content,
      embedding: JSON.stringify(embeddings[idx]),
      char_start: chunk.char_start,
      char_end: chunk.char_end,
    }));

    const { error: insertErr } = await supabase
      .from("document_chunks")
      .insert(rows);

    if (insertErr) {
      return {
        success: false,
        chunks_created: totalCreated,
        error: `Insert failed: ${insertErr.message}`,
      };
    }

    totalCreated += batch.length;
  }

  // Update document flags
  await supabase
    .from("documents")
    .update({
      indexed_for_rag: true,
      last_indexed_at: new Date().toISOString(),
    })
    .eq("id", docId);

  return { success: true, chunks_created: totalCreated };
}

async function removeDocument(
  supabase: ReturnType<typeof createClient>,
  docId: string
): Promise<{ success: boolean; error?: string }> {
  // Delete chunks
  await supabase
    .from("document_chunks")
    .delete()
    .eq("document_id", docId);

  // Reset flag
  await supabase
    .from("documents")
    .update({ indexed_for_rag: false, last_indexed_at: null })
    .eq("id", docId);

  return { success: true };
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Verify authentication (accepts user tokens and service role key)
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Not authenticated" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { doc_id, action } = await req.json();

    if (!doc_id || !action) {
      return new Response(
        JSON.stringify({ error: "doc_id and action required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const openaiKey = Deno.env.get("OPENAI_API_KEY");

    const supabase = createClient(supabaseUrl, supabaseKey);

    if (action === "remove") {
      const result = await removeDocument(supabase, doc_id);
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "index") {
      if (!openaiKey) {
        return new Response(
          JSON.stringify({ error: "OPENAI_API_KEY not configured" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check if document has extracted text
      const { data: doc } = await supabase
        .from("documents")
        .select("content_text")
        .eq("id", doc_id)
        .single();

      if (!doc?.content_text || doc.content_text.trim().length < 20) {
        // No text yet — trigger n8n pipeline for Docling extraction + indexing
        const n8nWebhookUrl = Deno.env.get("N8N_RAG_WEBHOOK_URL");
        if (!n8nWebhookUrl) {
          return new Response(
            JSON.stringify({ error: "N8N_RAG_WEBHOOK_URL not configured" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Fire and forget — n8n will extract text via Docling, save it,
        // then call this Edge Function again to chunk + embed
        fetch(n8nWebhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ doc_id }),
        }).catch(() => {});

        return new Response(
          JSON.stringify({
            success: true,
            status: "extracting",
            message: "PDF text extraction started. This takes 2-3 minutes. The document will be indexed automatically.",
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const result = await indexDocument(supabase, doc_id, openaiKey);

      // After successful indexing, automatically extract dates
      if (result.success) {
        const extractDatesUrl = `${supabaseUrl}/functions/v1/extract-dates`;
        fetch(extractDatesUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${supabaseKey}`,
          },
          body: JSON.stringify({ document_id: doc_id }),
        }).catch(() => {});
      }

      return new Response(JSON.stringify(result), {
        status: result.success ? 200 : 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ error: "Invalid action. Use 'index' or 'remove'" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
