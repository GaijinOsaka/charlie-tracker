import { createClient } from "npm:@supabase/supabase-js@2";
import { authenticate } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

async function embedQuery(text: string, openaiKey: string): Promise<number[]> {
  const resp = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openaiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: text.slice(0, 8000),
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`OpenAI embedding error: ${resp.status} ${err}`);
  }

  const data = await resp.json();
  return data.data[0].embedding;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;

    const auth = await authenticate(req);
    if (!auth.ok) {
      return new Response(JSON.stringify(auth.body), {
        status: auth.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { question, history } = await req.json();

    if (!question || typeof question !== "string") {
      return new Response(JSON.stringify({ error: "question is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");

    if (!openaiKey) {
      return new Response(
        JSON.stringify({ error: "OPENAI_API_KEY not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (!anthropicKey) {
      return new Response(
        JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. Embed the question
    const queryEmbedding = await embedQuery(question, openaiKey);

    // 2. Search for relevant chunks via direct PostgREST RPC
    const rpcResp = await fetch(
      `${supabaseUrl}/rest/v1/rpc/search_knowledge_base`,
      {
        method: "POST",
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query_embedding: `[${queryEmbedding.join(",")}]`,
          match_threshold: 0.2,
          match_count: 5,
        }),
      },
    );

    if (!rpcResp.ok) {
      const err = await rpcResp.text();
      throw new Error(`Search error: ${rpcResp.status} ${err}`);
    }

    const chunks = await rpcResp.json();

    // 3. Build context from chunks
    const sources: { filename: string; content: string }[] = [];
    let docContext = "";

    if (chunks && chunks.length > 0) {
      for (const chunk of chunks) {
        docContext += `\n--- From: ${chunk.document_name} ---\n${chunk.content}\n`;
        // Deduplicate sources by filename
        if (!sources.some((s) => s.filename === chunk.document_name)) {
          sources.push({
            filename: chunk.document_name,
            content: chunk.content.slice(0, 200),
          });
        }
      }
    }

    // 3b. Fetch calendar events (past 7 days + next 60 days)
    const today = new Date().toISOString().split("T")[0];
    const pastDate = new Date(Date.now() - 7 * 86400000)
      .toISOString()
      .split("T")[0];
    const futureDate = new Date(Date.now() + 60 * 86400000)
      .toISOString()
      .split("T")[0];

    const { data: events } = await supabase
      .from("events")
      .select(
        "title, event_date, event_end_date, event_time, event_end_time, description, action_required, action_detail, source_type",
      )
      .gte("event_date", pastDate)
      .lte("event_date", futureDate)
      .eq("archived", false)
      .order("event_date", { ascending: true });

    let eventsContext = "";
    if (events && events.length > 0) {
      eventsContext = "\n## Calendar Events\n";
      for (const evt of events) {
        const dateStr =
          evt.event_date + (evt.event_time ? ` at ${evt.event_time}` : "");
        const endStr =
          evt.event_end_date && evt.event_end_date !== evt.event_date
            ? ` to ${evt.event_end_date}`
            : "";
        const actionStr = evt.action_required
          ? ` [ACTION REQUIRED: ${evt.action_detail || "yes"}]`
          : "";
        eventsContext += `- ${dateStr}${endStr}: ${evt.title}${actionStr}${evt.description ? ` — ${evt.description}` : ""}\n`;
      }
    }

    // 4. Build conversation messages for Claude
    const systemPrompt = `You are Charlie, a helpful assistant for a parent tracking their child's school communications and documents.

Today's date is ${today}. Use this to understand relative time references like "today", "tomorrow", "this week", "next week", etc.

Answer questions using the provided document excerpts and calendar events below. When citing information from documents, mention the filename. When answering about events, reference the date and event title.

If the available information doesn't contain enough to answer the question, say so clearly — do not make up information.

Keep answers concise and helpful.

${docContext ? `## Document Excerpts\n${docContext}` : "No documents have been indexed yet."}
${eventsContext || "No calendar events found in the upcoming period."}`;

    // Build messages array with history
    const messages: { role: string; content: string }[] = [];

    if (history && Array.isArray(history)) {
      // Include up to last 10 messages for context
      const recentHistory = history.slice(-10);
      for (const msg of recentHistory) {
        if (msg.role === "user" || msg.role === "assistant") {
          messages.push({ role: msg.role, content: msg.content });
        }
      }
    }

    messages.push({ role: "user", content: question });

    // 5. Call Claude
    const claudeResp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        system: systemPrompt,
        messages,
      }),
    });

    if (!claudeResp.ok) {
      const err = await claudeResp.text();
      throw new Error(`Anthropic API error: ${claudeResp.status} ${err}`);
    }

    const claudeData = await claudeResp.json();
    const answer =
      claudeData.content?.[0]?.text || "Sorry, I couldn't generate a response.";

    return new Response(
      JSON.stringify({
        answer,
        sources,
        chunks_found: chunks?.length || 0,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
