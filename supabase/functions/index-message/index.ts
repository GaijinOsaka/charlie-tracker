import { createClient } from "npm:@supabase/supabase-js@2";
import { chunkText, generateEmbeddings } from "../_shared/chunking.ts";
import { authenticate } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

async function indexMessage(
  supabase: ReturnType<typeof createClient>,
  messageId: string,
  openaiKey: string,
  supabaseUrl: string,
  supabaseKey: string,
  scope: { includeMessage: boolean; attachmentIds: string[] | null },
): Promise<{
  success: boolean;
  chunks_created: number;
  attachments_dispatched: number;
  error?: string;
}> {
  // 1. Fetch message
  const { data: msg, error: msgErr } = await supabase
    .from("messages")
    .select("id, subject, content")
    .eq("id", messageId)
    .single();

  if (msgErr || !msg) {
    return {
      success: false,
      chunks_created: 0,
      attachments_dispatched: 0,
      error: "Message not found",
    };
  }

  let totalCreated = 0;
  let messageDocId: string | null = null;

  if (scope.includeMessage) {
    if (!msg.content || msg.content.trim().length < 20) {
      return {
        success: false,
        chunks_created: 0,
        attachments_dispatched: 0,
        error: "Message has no content to index",
      };
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
        return {
          success: false,
          chunks_created: 0,
          attachments_dispatched: 0,
          error: `Failed to update document: ${updateErr.message}`,
        };
      }
      docId = existingDoc.id;
    } else {
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
        return {
          success: false,
          chunks_created: 0,
          attachments_dispatched: 0,
          error: `Failed to create document: ${insertDocErr?.message}`,
        };
      }
      docId = newDoc.id;
    }

    // 3. Delete existing chunks for re-index, then chunk and embed
    await supabase.from("document_chunks").delete().eq("document_id", docId);

    const chunks = chunkText(msg.content);
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
        rag_status: "indexed",
        rag_error: null,
      })
      .eq("id", docId);

    messageDocId = docId;
  }

  // 5. Resolve attachments in scope, then fire index-document for each
  let attachmentsDispatched = 0;
  const attachmentIdsInScope = scope.attachmentIds;

  if (attachmentIdsInScope === null || attachmentIdsInScope.length > 0) {
    let query = supabase
      .from("attachments")
      .select("id, file_path")
      .eq("message_id", messageId);

    if (attachmentIdsInScope !== null) {
      query = query.in("id", attachmentIdsInScope);
    }

    const { data: attachments } = await query;

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
  }

  // 6. Update messages.indexed_for_rag only when the body was (re-)indexed
  if (scope.includeMessage) {
    await supabase
      .from("messages")
      .update({ indexed_for_rag: true })
      .eq("id", messageId);
  }

  // 7. Fire extract-dates for the message document if we indexed it
  if (messageDocId) {
    const extractDatesUrl = `${supabaseUrl}/functions/v1/extract-dates`;
    fetch(extractDatesUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({ document_id: messageDocId }),
    }).catch(() => {});
  }

  return {
    success: true,
    chunks_created: totalCreated,
    attachments_dispatched: attachmentsDispatched,
  };
}

async function removeMessage(
  supabase: ReturnType<typeof createClient>,
  messageId: string,
  scope: { includeMessage: boolean; attachmentIds: string[] | null },
): Promise<{ success: boolean; error?: string }> {
  if (scope.includeMessage) {
    // 1. Find the synthetic document and clear its index
    const syntheticPath = `email_message/${messageId}`;
    const { data: doc } = await supabase
      .from("documents")
      .select("id")
      .eq("file_path", syntheticPath)
      .maybeSingle();

    if (doc) {
      await supabase.from("document_chunks").delete().eq("document_id", doc.id);

      await supabase
        .from("documents")
        .update({
          indexed_for_rag: false,
          last_indexed_at: null,
          rag_status: "idle",
          rag_error: null,
        })
        .eq("id", doc.id);
    }

    await supabase
      .from("messages")
      .update({ indexed_for_rag: false })
      .eq("id", messageId);
  }

  // 2. For each attachment in scope: delete chunks, reset flag
  const attachmentIdsInScope = scope.attachmentIds;

  if (attachmentIdsInScope === null || attachmentIdsInScope.length > 0) {
    let query = supabase
      .from("attachments")
      .select("id, file_path")
      .eq("message_id", messageId);

    if (attachmentIdsInScope !== null) {
      query = query.in("id", attachmentIdsInScope);
    }

    const { data: attachments } = await query;

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
            .update({
              indexed_for_rag: false,
              last_indexed_at: null,
              rag_status: "idle",
              rag_error: null,
            })
            .eq("id", attDoc.id);
        }
      }
    }
  }

  return { success: true };
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const auth = await authenticate(req);
    if (!auth.ok) {
      return new Response(JSON.stringify(auth.body), {
        status: auth.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const body = await req.json();
    const { message_id, action } = body;

    if (!message_id || !action) {
      return new Response(
        JSON.stringify({ error: "message_id and action required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Backwards-compatible scope: defaults reproduce the original
    // "do everything" behaviour when the caller omits the new fields.
    const includeMessage =
      typeof body.include_message === "boolean" ? body.include_message : true;
    const attachmentIds = Array.isArray(body.attachment_ids)
      ? body.attachment_ids.filter((v: unknown) => typeof v === "string")
      : null;
    const scope = { includeMessage, attachmentIds };

    if (
      !scope.includeMessage &&
      scope.attachmentIds !== null &&
      scope.attachmentIds.length === 0
    ) {
      return new Response(
        JSON.stringify({ error: "Nothing selected: pick the message or at least one attachment" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const openaiKey = Deno.env.get("OPENAI_API_KEY");

    const supabase = createClient(supabaseUrl, supabaseKey);

    if (action === "remove") {
      const result = await removeMessage(supabase, message_id, scope);
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "index") {
      if (scope.includeMessage && !openaiKey) {
        return new Response(
          JSON.stringify({ error: "OPENAI_API_KEY not configured" }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      const result = await indexMessage(
        supabase,
        message_id,
        openaiKey ?? "",
        supabaseUrl,
        supabaseKey,
        scope,
      );
      return new Response(JSON.stringify(result), {
        status: result.success ? 200 : 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ error: "Invalid action. Use 'index' or 'remove'" }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
