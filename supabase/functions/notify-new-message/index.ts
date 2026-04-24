import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY")!;
const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY")!;

webpush.setVapidDetails(
  "mailto:davidjamesoakes@gmail.com",
  vapidPublicKey,
  vapidPrivateKey,
);

interface MessagePayload {
  id: string;
  subject: string;
  content: string;
  sender_name: string;
  source: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const payload: MessagePayload = await req.json();
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch active push subscriptions only
    const { data: subscriptions, error: fetchError } = await supabase
      .from("push_subscriptions")
      .select("id, subscription, user_id")
      .is("deleted_at", null);

    if (fetchError) {
      console.error("Failed to fetch subscriptions:", fetchError);
      return new Response(
        JSON.stringify({ error: "Failed to process notifications" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(
        JSON.stringify({ message: "No subscriptions found" }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const notificationPayload = JSON.stringify({
      title: `New message from ${payload.sender_name || payload.source}`,
      body: payload.subject,
      icon: "/icons/icon-192.png",
      tag: `message-${payload.id}`,
      data: {
        messageId: payload.id,
        url: `/messages/${payload.id}`,
      },
    });

    const pushResults = [];
    const expiredSubscriptions: string[] = [];

    for (const sub of subscriptions) {
      try {
        const pushSub = sub.subscription;
        if (
          !pushSub?.endpoint ||
          !pushSub?.keys?.p256dh ||
          !pushSub?.keys?.auth
        ) {
          console.warn(`Invalid subscription structure for ${sub.id}`);
          expiredSubscriptions.push(sub.id);
          pushResults.push({ id: sub.id, success: false, reason: "invalid" });
          continue;
        }

        await webpush.sendNotification(
          {
            endpoint: pushSub.endpoint,
            keys: { p256dh: pushSub.keys.p256dh, auth: pushSub.keys.auth },
          },
          notificationPayload,
        );
        pushResults.push({ id: sub.id, success: true });
      } catch (error: any) {
        const statusCode = error?.statusCode;
        console.error(
          `Push failed for ${sub.id}: ${statusCode} ${error?.message}`,
        );
        // 404/410 = subscription expired/unsubscribed
        if (statusCode === 404 || statusCode === 410) {
          expiredSubscriptions.push(sub.id);
        }
        pushResults.push({
          id: sub.id,
          success: false,
          reason: statusCode || "error",
        });
      }
    }

    // Soft-delete expired subscriptions
    if (expiredSubscriptions.length > 0) {
      const { error: updateErr } = await supabase
        .from("push_subscriptions")
        .update({ deleted_at: new Date().toISOString() })
        .in("id", expiredSubscriptions);
      if (updateErr)
        console.warn("Failed to cleanup subscriptions:", updateErr);
    }

    return new Response(
      JSON.stringify({
        message: "Notifications sent",
        total: subscriptions.length,
        succeeded: pushResults.filter((r) => r.success).length,
        failed: pushResults.filter((r) => !r.success).length,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Error in notify-new-message:", error);
    return new Response(
      JSON.stringify({ error: "Failed to process notifications" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
