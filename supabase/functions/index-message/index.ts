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

async function indexMessage(
  supabase: ReturnType<typeof createClient>,
  messageId: string,
  openaiKey: string,
  supabaseUrl: string,
  supabaseKey: string
): Promise<{ success: boolean; chunks_created: number; attachments_dispatched: number; error?: string }> {
  // 1. Fetch message
  const { data: msg, error: msgErr } = await supabase
    .from("messages")
    .select("id, subject, content")
    .eq("id", messageId)
    .single();

  if (msgErr || !msg) {
    return { success: false, chunks_created: 0, attachments_dispatched: 0, error: "Message not found" };
  }

  if (!msg.content || msg.content.trim().length < 20) {
    return { success: false, chunks_created: 0, attachments_dispatched: 0, error: "Message has no content to index" };
  }

  // 2. Upsert a documents row for the message content
  const syntheticPath = `email_message/${messageId}`;

  const { data: existingDoc } = await supabase
    .from("documents")
    .select("id")
    .eq("file_path", syntheticPath)
    .maybeSingle();

  let docId: string;

  if (existingDoc) {
    // Update existing document
    const { error: updateErr } = await supabase
      .from("documents")
      .update({
        filename: msg.subject || "(no subject)",
        content_text: msg.content,
        source_type: "email_message",
        tags: ["email", "message"],
        category: "other",
      })
      .eq("id", existingDoc.id);

    if (updateErr) {
      return { success: false, chunks_created: 0, attachments_dispatched: 0, error: `Failed to update document: ${updateErr.message}` };
    }
    docId = existingDoc.id;
  } else {
    // Insert new document
    const { data: newDoc, error: insertDocErr } = await supabase
      .from("documents")
      .insert({
        filename: msg.subject || "(no subject)",
        file_path: syntheticPath,
        content_text: msg.content,
        source_type: "email_message",
        tags: ["email", "message"],
        category: "other",
      })
      .select("id")
      .single();

    if (insertDocErr || !newDoc) {
      return { success: false, chunks_created: 0, attachments_dispatched: 0, error: `Failed to create document: ${insertDocErr?.message}` };
    }
    docId = newDoc.id;
  }

  // 3. Delete existing chunks for re-index, then chunk and embed
  await supabase
    .from("document_chunks")
    .delete()
    .eq("document_id", docId);

  const chunks = chunkText(msg.content);

  let totalCreated = 0;
  const batchSize = 20;

  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    const texts = batch.map((c) => c.content);

    const embeddings = await generateEmbeddings(texts, openaiKey);

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
        attachments_dispatched: 0,
        error: `Insert failed: ${insertErr.message}`,
      };
    }

    totalCreated += batch.length;
  }

  // 4. Mark document as indexed
  await supabase
    .from("documents")
    .update({
      indexed_for_rag: true,
      last_indexed_at: new Date().toISOString(),
    })
    .eq("id", docId);

  // 5. For each attachment: find its documents row and fire index-document
  const { data: attachments } = await supabase
    .from("attachments")
    .select("id, file_path")
    .eq("message_id", messageId);

  let attachmentsDispatched = 0;

  if (attachments && attachments.length > 0) {
    const indexDocumentUrl = `${supabaseUrl}/functions/v1/index-document`;

    for (const att of attachments) {
      if (!att.file_path) continue;

      const { data: attDoc } = await supabase
        .from("documents")
        .select("id")
        .eq("file_path", att.file_path)
        .maybeSingle();

      if (attDoc) {
        fetch(indexDocumentUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${supabaseKey}`,
          },
          body: JSON.stringify({ doc_id: attDoc.id, action: "index" }),
        }).catch(() => {});

        attachmentsDispatched++;
      }
    }
  }

  // 6. Update messages.indexed_for_rag
  await supabase
    .from("messages")
    .update({ indexed_for_rag: true })
    .eq("id", messageId);

  // 7. Fire extract-dates for the message document
  const extractDatesUrl = `${supabaseUrl}/functions/v1/extract-dates`;
  fetch(extractDatesUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${supabaseKey}`,
    },
    body: JSON.stringify({ document_id: docId }),
  }).catch(() => {});

  return { success: true, chunks_created: totalCreated, attachments_dispatched: attachmentsDispatched };
}

async function removeMessage(
  supabase: ReturnType<typeof createClient>,
  messageId: string
): Promise<{ success: boolean; error?: string }> {
  // 1. Find the synthetic document
  const syntheticPath = `email_message/${messageId}`;
  const { data: doc } = await supabase
    .from("documents")
    .select("id")
    .eq("file_path", syntheticPath)
    .maybeSingle();

  if (doc) {
    // Delete chunks and reset flag on the message document
    await supabase
      .from("document_chunks")
      .delete()
      .eq("document_id", doc.id);

    await supabase
      .from("documents")
      .update({ indexed_for_rag: false, last_indexed_at: null })
      .eq("id", doc.id);
  }

  // 2. For each attachment document: delete chunks, reset flag
  const { data: attachments } = await supabase
    .from("attachments")
    .select("id, file_path")
    .eq("message_id", messageId);

  if (attachments && attachments.length > 0) {
    for (const att of attachments) {
      if (!att.file_path) continue;

      const { data: attDoc } = await supabase
        .from("documents")
        .select("id")
        .eq("file_path", att.file_path)
        .maybeSingle();

      if (attDoc) {
        await supabase
          .from("document_chunks")
          .delete()
          .eq("document_id", attDoc.id);

        await supabase
          .from("documents")
          .update({ indexed_for_rag: false, last_indexed_at: null })
          .eq("id", attDoc.id);
      }
    }
  }

  // 3. Update messages.indexed_for_rag
  await supabase
    .from("messages")
    .update({ indexed_for_rag: false })
    .eq("id", messageId);

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

    const { message_id, action } = await req.json();

    if (!message_id || !action) {
      return new Response(
        JSON.stringify({ error: "message_id and action required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const openaiKey = Deno.env.get("OPENAI_API_KEY");

    const supabase = createClient(supabaseUrl, supabaseKey);

    if (action === "remove") {
      const result = await removeMessage(supabase, message_id);
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

      const result = await indexMessage(supabase, message_id, openaiKey, supabaseUrl, supabaseKey);
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
