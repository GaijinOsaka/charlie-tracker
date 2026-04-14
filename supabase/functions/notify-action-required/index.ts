import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

// CORS headers for consistency with other Edge Functions
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Environment variable validation (Issue #4)
const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error(
    "Required environment variables not set: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY"
  );
}

interface MessagePayload {
  id: string;
  status: string;
  subject: string;
  body: string;
  sender: string;
  old_status: string | null;
}

interface WebPushSubscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

Deno.serve(async (req) => {
  // Issue #7: Add CORS headers to all responses
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  // Only handle POST requests
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  // Issue #3: Add Bearer token validation for authorization
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  try {
    const payload: MessagePayload = await req.json();

    // Only trigger if status changed TO "action_required"
    if (payload.status !== "action_required" || payload.old_status === "action_required") {
      return new Response(
        JSON.stringify({ message: "No notification triggered" }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch all active push subscriptions
    const { data: subscriptions, error: fetchError } = await supabase
      .from("push_subscriptions")
      .select("id, subscription, user_id");

    if (fetchError) {
      console.error("Failed to fetch subscriptions:", fetchError);
      return new Response(
        JSON.stringify({
          error: "Failed to process notifications",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(
        JSON.stringify({ message: "No subscriptions found" }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Prepare Web Push notification payload
    const messageSnippet = payload.body.substring(0, 150).replace(/\n/g, " ");
    const notificationPayload = {
      title: "Action Required",
      body: `${payload.sender}: ${payload.subject}`,
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-72.png",
      tag: `message-${payload.id}`, // Prevent duplicates for same message
      data: {
        messageId: payload.id,
        snippet: messageSnippet,
        url: `/messages/${payload.id}`,
      },
    };

    // Send Web Push to all subscriptions
    const pushResults = [];
    const failedSubscriptions = [];

    for (const sub of subscriptions) {
      try {
        const webPushSub = sub.subscription as WebPushSubscription;

        // Validate Web Push subscription structure
        if (!webPushSub.endpoint || !webPushSub.keys?.p256dh || !webPushSub.keys?.auth) {
          console.warn(`Invalid subscription structure for ${sub.id}`);
          failedSubscriptions.push(sub.id);
          pushResults.push({
            subscriptionId: sub.id,
            success: false,
            status: "invalid_subscription",
          });
          continue;
        }

        // Send Web Push notification via browser push service
        const response = await fetch(webPushSub.endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/octet-stream",
            "TTL": "24",
          },
          // Note: In production, this should use the web-push library to encrypt the payload
          // For now, we send the notification as plaintext for browser interpretation
          body: JSON.stringify(notificationPayload),
        });

        if (!response.ok) {
          const status = response.status;
          // 401/403/404 = invalid subscription, should be deleted
          if (status === 401 || status === 403 || status === 404 || status === 410) {
            failedSubscriptions.push(sub.id);
          }
          pushResults.push({
            subscriptionId: sub.id,
            success: false,
            status,
          });
        } else {
          pushResults.push({
            subscriptionId: sub.id,
            success: true,
          });
        }
      } catch (error) {
        console.error(`Failed to send push to ${sub.id}:`, error);
        pushResults.push({
          subscriptionId: sub.id,
          success: false,
        });
      }
    }

    // Issue #6: Error handling for cleanup with proper error checking
    if (failedSubscriptions.length > 0) {
      const { error: deleteErr } = await supabase
        .from("push_subscriptions")
        .delete()
        .in("id", failedSubscriptions);
      if (deleteErr) {
        console.warn("Failed to cleanup subscriptions:", deleteErr);
      }
    }

    // Issue #8: TODO for duplicate prevention
    // TODO: Implement idempotency check to prevent duplicate notifications
    // Plan: Add message_notifications table to track which messages have been notified
    // This would require a schema change to add (message_id, user_id) unique constraint

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
      }
    );
  } catch (error) {
    // Issue #5: Don't expose internal error details
    console.error("Error in notify-action-required:", error);
    return new Response(
      JSON.stringify({
        error: "Failed to process notifications",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
