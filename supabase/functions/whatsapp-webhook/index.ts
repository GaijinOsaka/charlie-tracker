import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Helper: Hash phone number using SHA-256
async function hashPhoneNumber(phone: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(phone);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Helper: Send message via Twilio API
async function sendTwilioMessage(
  to: string,
  body: string,
  accountSid: string,
  authToken: string,
): Promise<void> {
  const auth = btoa(`${accountSid}:${authToken}`);
  const params = new URLSearchParams();
  params.append("From", Deno.env.get("TWILIO_PUBLIC_NUMBER")!);
  params.append("To", to);
  params.append("Body", body);

  const resp = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    },
  );

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Twilio API error: ${resp.status} ${err}`);
  }
}

// Helper: Call rag-chat Edge Function
async function callRagChat(
  message: string,
  accessLevel: "public" | "private" = "private",
): Promise<string> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const resp = await fetch(`${supabaseUrl}/functions/v1/rag-chat`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      question: message,
      history: [],
      accessLevel: accessLevel,
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`RAG chat error: ${resp.status} ${err}`);
  }

  const data = await resp.json();
  return data.answer || "I couldn't generate a response. Please try again.";
}

Deno.serve(async (req) => {
  // Only accept POST requests
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // Parse form-encoded request from Twilio
    const formData = await req.formData();
    const from = formData.get("From") as string;
    const to = formData.get("To") as string;
    const body = formData.get("Body") as string;

    if (!from || !to || !body) {
      return new Response(
        JSON.stringify({
          error: "Missing From, To, or Body parameters",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Get environment variables
    const twilioAccountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const twilioAuthToken = Deno.env.get("TWILIO_AUTH_TOKEN");
    const twilioPublicNumber = Deno.env.get("TWILIO_PUBLIC_NUMBER");
    const twilioPrivateNumber = Deno.env.get("TWILIO_PRIVATE_NUMBER");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (
      !twilioAccountSid ||
      !twilioAuthToken ||
      !twilioPublicNumber ||
      !twilioPrivateNumber ||
      !supabaseUrl ||
      !supabaseServiceRoleKey
    ) {
      return new Response(
        JSON.stringify({ error: "Missing required environment variables" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Create Supabase client with service role
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    // Hash the phone number
    const phoneHash = await hashPhoneNumber(from);

    // Determine if this is public or private number and route accordingly
    let accessLevel: "public" | "private";
    let responseMessage: string;

    if (to === twilioPrivateNumber) {
      // Private number - require authorization
      accessLevel = "private";

      // Check if sender is authorized
      const { data: user, error: userError } = await supabase
        .from("whatsapp_users")
        .select("*")
        .eq("phone_number_hash", phoneHash)
        .eq("is_active", true)
        .single();

      if (userError || !user) {
        const denialMessage =
          "You don't have access to this WhatsApp number. Please contact your administrator.";

        // Log denied attempt
        try {
          await supabase.from("whatsapp_interactions").insert({
            phone_number_hash: phoneHash,
            access_level: "private",
            query_text: body,
            response_text: denialMessage,
          });
        } catch (logError) {
          console.error("Error logging denied interaction:", logError);
        }

        // Send response to user
        try {
          await sendTwilioMessage(
            from,
            denialMessage,
            twilioAccountSid,
            twilioAuthToken,
          );
        } catch (twilioError) {
          console.error("Error sending Twilio response:", twilioError);
        }

        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Authorized - call rag-chat with private access
      try {
        responseMessage = await callRagChat(body, "private");
      } catch (ragError) {
        console.error("RAG chat error:", ragError);
        responseMessage =
          "I encountered an error processing your request. Please try again.";
      }
    } else if (to === twilioPublicNumber) {
      // Public number - allow all with public access
      accessLevel = "public";

      // Call rag-chat with public access
      try {
        responseMessage = await callRagChat(body, "public");
      } catch (ragError) {
        console.error("RAG chat error:", ragError);
        responseMessage =
          "I encountered an error processing your request. Please try again.";
      }
    } else {
      return new Response(
        JSON.stringify({ error: "Unknown WhatsApp number" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Log the interaction (anonymized by phone hash)
    try {
      await supabase.from("whatsapp_interactions").insert({
        phone_number_hash: phoneHash,
        access_level: accessLevel,
        query_text: body,
        response_text: responseMessage,
      });
    } catch (logError) {
      console.error("Error logging interaction:", logError);
      // Don't fail the whole request if logging fails
    }

    // Send response back via Twilio
    try {
      await sendTwilioMessage(
        from,
        responseMessage,
        twilioAccountSid,
        twilioAuthToken,
      );
    } catch (twilioError) {
      console.error("Error sending Twilio response:", twilioError);
      return new Response(JSON.stringify({ error: twilioError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Webhook error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
