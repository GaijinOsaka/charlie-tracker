import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonError("Not authenticated (no Authorization header)", 401);
    }
    const jwt = authHeader.replace(/^Bearer\s+/i, "");

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const {
      data: { user },
      error: authError,
    } = await supabaseUser.auth.getUser(jwt);
    if (authError || !user) {
      return jsonError(
        `Not authenticated (getUser: ${authError?.message || "no user"})`,
        401,
      );
    }

    const { data: settings, error: settingsError } = await supabaseUser
      .from("user_whatsapp_settings")
      .select("whatsapp_phone, whatsapp_enabled")
      .eq("user_id", user.id)
      .maybeSingle();

    if (settingsError) {
      return jsonError(settingsError.message, 500);
    }
    if (!settings?.whatsapp_phone) {
      return jsonError(
        "No phone number stored. Save your settings first, then send a test.",
        400,
      );
    }
    if (!settings.whatsapp_enabled) {
      return jsonError(
        "WhatsApp reminders are disabled. Enable them to send a test.",
        400,
      );
    }

    const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
    const from = Deno.env.get("TWILIO_PRIVATE_NUMBER");

    if (!accountSid || !authToken || !from) {
      return jsonError(
        "Twilio is not configured on the server (missing TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_PRIVATE_NUMBER).",
        500,
      );
    }

    const to = settings.whatsapp_phone.startsWith("whatsapp:")
      ? settings.whatsapp_phone
      : `whatsapp:${settings.whatsapp_phone}`;
    const fromAddr = from.startsWith("whatsapp:") ? from : `whatsapp:${from}`;
    const body =
      "Charlie Tracker test message — your WhatsApp reminders are set up correctly.";

    const params = new URLSearchParams();
    params.set("To", to);
    params.set("From", fromAddr);
    params.set("Body", body);

    const twilioResp = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      },
    );

    const twilioJson = await twilioResp.json();

    if (!twilioResp.ok) {
      return jsonError(
        twilioJson.message || `Twilio error (HTTP ${twilioResp.status})`,
        502,
        { twilio_code: twilioJson.code, more_info: twilioJson.more_info },
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        sid: twilioJson.sid,
        to: twilioJson.to,
        status: twilioJson.status,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : String(err), 500);
  }
});

function jsonError(message: string, status: number, extra: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({ error: message, ...extra }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
