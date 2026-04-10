import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.0";

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

    // Verify user JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAuth = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const {
      data: { user },
      error: authError,
    } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { question, history, accessLevel } = await req.json();

    if (!question || typeof question !== "string") {
      return new Response(JSON.stringify({ error: "question is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Default to 'private' if accessLevel not provided (safe default for authenticated users)
    const level = (accessLevel === "public" || accessLevel === "private")
      ? accessLevel
      : "private";

    // Log for debugging and audit
    console.log(`RAG search with access_level: ${level} (requested: ${accessLevel || 'none'})`);

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
          access_level: level,
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
    let context = "";

    if (chunks && chunks.length > 0) {
      for (const chunk of chunks) {
        context += `\n--- From: ${chunk.document_name} ---\n${chunk.content}\n`;
        // Deduplicate sources by filename
        if (!sources.some((s) => s.filename === chunk.document_name)) {
          sources.push({
            filename: chunk.document_name,
            content: chunk.content.slice(0, 200),
          });
        }
      }
    }

    // 4. Build conversation messages for Claude
    const systemPrompt = `You are Charlie, a helpful assistant for a parent tracking their child's school communications and documents.

Answer questions using ONLY the provided document excerpts below. Always cite which document your answer comes from by mentioning the filename.

If the documents don't contain enough information to answer the question, say so clearly — do not make up information.

Keep answers concise and helpful.

${context ? `## Document Excerpts\n${context}` : "No documents have been indexed yet. Let the user know they need to add documents to RAG first."}`;

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
