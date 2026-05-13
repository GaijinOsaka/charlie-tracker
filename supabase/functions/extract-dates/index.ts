import { createClient } from "npm:@supabase/supabase-js@2";

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
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const isServiceRole = authHeader === `Bearer ${supabaseKey}`;

    if (!isServiceRole) {
      // Validate user JWT via JWKS (new JWT Signing Keys system).
      const publishableKeys = JSON.parse(
        Deno.env.get("SUPABASE_PUBLISHABLE_KEYS")!,
      );
      const supabaseAuth = createClient(supabaseUrl, publishableKeys.default, {
        global: { headers: { Authorization: authHeader } },
      });
      const jwt = authHeader.replace(/^Bearer\s+/i, "");
      const { data: claimsData, error: authError } =
        await supabaseAuth.auth.getClaims(jwt);
      if (authError || !claimsData?.claims?.sub) {
        return new Response(JSON.stringify({ error: "Not authenticated" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const { document_id } = await req.json();

    if (!document_id) {
      return new Response(
        JSON.stringify({ error: "document_id is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
    const openaiKey = Deno.env.get("OPENAI_API_KEY");

    if (!openaiKey) {
      return new Response(
        JSON.stringify({ error: "OPENAI_API_KEY not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
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
      return new Response(JSON.stringify({ error: "Document not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!doc.content_text || doc.content_text.trim().length < 20) {
      return new Response(
        JSON.stringify({
          error:
            "Document has no extracted text. Run Docling extraction first.",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Truncate content for the API call
    const contentText = doc.content_text.slice(0, 30000);
    const today = new Date().toISOString().split("T")[0];

    // Call OpenAI to extract dates/events
    const prompt = `You are a date and event extraction assistant. Analyze the following document and extract all dates, deadlines, events, and scheduled items.

Today's date is ${today}. Use this to resolve any relative dates (e.g., "next Monday", "in 2 weeks"). Dates in the document use UK convention (DD/MM/YYYY) — do not interpret "10/05" as October 5th; it is 10 May.

Document filename: ${doc.filename || "unknown"}

For each event or date found, return:
- title: short descriptive title (required)
- event_date: start date in YYYY-MM-DD format (required)
- event_end_date: end date in YYYY-MM-DD format when the source states a multi-day range, otherwise null
- event_time: start time in HH:MM (24h) format, or null if no specific time
- event_end_time: end time in HH:MM (24h) format when the source states a finish time, otherwise null
- description: brief description or context from the document
- action_required: boolean, true if something needs to be done by/on this date
- action_detail: what action is needed, or null if no action required

When a date range is stated (e.g. "1st–13th June", "12 May to 14 May", "Mon 9 Jun – Fri 13 Jun"), populate BOTH event_date AND event_end_date. Single-day events leave event_end_date as null — do not duplicate the start date into end_date.

Examples:

Single-day with time range:
  Source: "School Holiday Tennis Camp on Tuesday 27 May, 09:00–15:00"
  Output: { "title": "School Holiday Tennis Camp", "event_date": "2026-05-27", "event_end_date": null, "event_time": "09:00", "event_end_time": "15:00" }

Multi-day exhibition:
  Source: "Rotary Art Competition Exhibition: winning entries displayed at Bingham Library from 1st–13th June 2026"
  Output: { "title": "Rotary Art Competition Exhibition", "event_date": "2026-06-01", "event_end_date": "2026-06-13", "event_time": null, "event_end_time": null }

Single-day no time:
  Source: "Y6 Residential Returns on Monday 18 May"
  Output: { "title": "Y6 Residential Returns", "event_date": "2026-05-18", "event_end_date": null, "event_time": null, "event_end_time": null }

Return a JSON object with an "events" array. If no dates or events are found, return {"events": []}.

Document text:
${contentText}`;

    const openaiResp = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
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
            {
              role: "system",
              content:
                "You extract dates and events from documents. Always respond with valid JSON.",
            },
            { role: "user", content: prompt },
          ],
        }),
      },
    );

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
      event_end_date?: string | null;
      event_time?: string | null;
      event_end_time?: string | null;
      description?: string | null;
      action_required?: boolean;
      action_detail?: string | null;
    }> = Array.isArray(parsed) ? parsed : parsed.events || [];

    // Delete existing events for this document (re-extraction support)
    await supabase.from("events").delete().eq("document_id", document_id);

    // Insert extracted events
    let eventsCreated = 0;

    if (extractedEvents.length > 0) {
      const rows = extractedEvents.map((evt) => ({
        document_id: document_id,
        title: evt.title,
        event_date: evt.event_date,
        event_end_date:
          evt.event_end_date && evt.event_end_date !== evt.event_date
            ? evt.event_end_date
            : null,
        event_time: evt.event_time || null,
        event_end_time: evt.event_end_time || null,
        description: evt.description || null,
        action_required: evt.action_required ?? false,
        action_detail: evt.action_detail || null,
      }));

      const { error: insertErr } = await supabase.from("events").insert(rows);

      if (insertErr && !insertErr.message.includes("23505")) {
        throw new Error(`Failed to insert events: ${insertErr.message}`);
      }

      // If unique constraint violation (23505), some events already existed—still a partial success
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
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
