import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

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

    const { document_id } = await req.json();

    if (!document_id) {
      return new Response(
        JSON.stringify({ error: "document_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const openaiKey = Deno.env.get("OPENAI_API_KEY");

    if (!openaiKey) {
      return new Response(
        JSON.stringify({ error: "OPENAI_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch document
    const { data: doc, error: fetchErr } = await supabase
      .from("documents")
      .select("id, filename, content_text")
      .eq("id", document_id)
      .single();

    if (fetchErr || !doc) {
      return new Response(
        JSON.stringify({ error: "Document not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!doc.content_text || doc.content_text.trim().length < 20) {
      return new Response(
        JSON.stringify({ error: "Document has no extracted text. Run Docling extraction first." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Truncate content for the API call
    const contentText = doc.content_text.slice(0, 30000);
    const today = new Date().toISOString().split("T")[0];

    // Call OpenAI to extract dates/events
    const prompt = `You are a date and event extraction assistant. Analyze the following document and extract all dates, deadlines, events, and scheduled items.

Today's date is ${today}. Use this to resolve any relative dates (e.g., "next Monday", "in 2 weeks").

Document filename: ${doc.filename || "unknown"}

For each event or date found, return:
- title: short descriptive title (required)
- event_date: date in YYYY-MM-DD format (required)
- event_time: time in HH:MM format, or null if no specific time
- description: brief description or context from the document
- action_required: boolean, true if something needs to be done by/on this date
- action_detail: what action is needed, or null if no action required

Return a JSON object with an "events" array. If no dates or events are found, return {"events": []}.

Document text:
${contentText}`;

    const openaiResp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "You extract dates and events from documents. Always respond with valid JSON." },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!openaiResp.ok) {
      const err = await openaiResp.text();
      throw new Error(`OpenAI API error: ${openaiResp.status} ${err}`);
    }

    const openaiData = await openaiResp.json();
    const rawContent = openaiData.choices?.[0]?.message?.content;

    if (!rawContent) {
      throw new Error("No response content from OpenAI");
    }

    const parsed = JSON.parse(rawContent);

    // Handle both { events: [...] } and direct array [...] formats
    const extractedEvents: Array<{
      title: string;
      event_date: string;
      event_time?: string | null;
      description?: string | null;
      action_required?: boolean;
      action_detail?: string | null;
    }> = Array.isArray(parsed) ? parsed : (parsed.events || []);

    // Delete existing events for this document (re-extraction support)
    await supabase
      .from("events")
      .delete()
      .eq("document_id", document_id);

    // Insert extracted events
    let eventsCreated = 0;

    if (extractedEvents.length > 0) {
      const rows = extractedEvents.map((evt) => ({
        document_id: document_id,
        title: evt.title,
        event_date: evt.event_date,
        event_time: evt.event_time || null,
        description: evt.description || null,
        action_required: evt.action_required ?? false,
        action_detail: evt.action_detail || null,
      }));

      const { error: insertErr } = await supabase
        .from("events")
        .insert(rows);

      if (insertErr) {
        throw new Error(`Failed to insert events: ${insertErr.message}`);
      }

      eventsCreated = rows.length;
    }

    // Update document flags
    await supabase
      .from("documents")
      .update({
        dates_extracted: true,
        dates_extracted_at: new Date().toISOString(),
      })
      .eq("id", document_id);

    return new Response(
      JSON.stringify({
        success: true,
        events_created: eventsCreated,
        document_id: document_id,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
