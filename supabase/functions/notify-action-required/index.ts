import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface MessagePayload {
  id: string;
  status: string;
  subject: string;
  body: string;
  sender: string;
  old_status: string | null;
}

Deno.serve(async (req) => {
  // Only handle POST requests
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
    });
  }

  try {
    const payload: MessagePayload = await req.json();

    // Only trigger if status changed TO "action_required"
    if (payload.status !== "action_required" || payload.old_status === "action_required") {
      return new Response(
        JSON.stringify({ message: "No notification triggered" }),
        { status: 200 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch all active push subscriptions
    const { data: subscriptions, error: fetchError } = await supabase
      .from("push_subscriptions")
      .select("id, subscription, user_id");

    if (fetchError) {
      throw new Error(`Failed to fetch subscriptions: ${fetchError.message}`);
    }

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(JSON.stringify({ message: "No subscriptions found" }), {
        status: 200,
      });
    }

    // Prepare notification payload
    const messageSnippet = payload.body.substring(0, 150).replace(/\n/g, " ");
    const notificationPayload = {
      title: "Action Required",
      body: `${payload.sender}: ${payload.subject}`,
      icon: "/icon-192.png",
      badge: "/badge-72.png",
      tag: `message-${payload.id}`, // Prevent duplicates for same message
      data: {
        messageId: payload.id,
        snippet: messageSnippet,
        url: `/messages/${payload.id}`,
      },
    };

    // Send push to all subscriptions
    const pushResults = [];
    const failedSubscriptions = [];

    for (const sub of subscriptions) {
      try {
        const response = await fetch("https://fcm.googleapis.com/fcm/send", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `key=${Deno.env.get("FCM_SERVER_KEY")}`,
          },
          body: JSON.stringify({
            to: sub.subscription.endpoint,
            notification: notificationPayload,
            data: notificationPayload.data,
          }),
        });

        if (!response.ok) {
          const status = response.status;
          // 401/403 = invalid subscription, should be deleted
          if (status === 401 || status === 403 || status === 404) {
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
          error: error.message,
        });
      }
    }

    // Clean up failed subscriptions
    if (failedSubscriptions.length > 0) {
      await supabase
        .from("push_subscriptions")
        .delete()
        .in("id", failedSubscriptions);
    }

    return new Response(
      JSON.stringify({
        message: "Notifications sent",
        total: subscriptions.length,
        succeeded: pushResults.filter((r) => r.success).length,
        failed: pushResults.filter((r) => !r.success).length,
        results: pushResults,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in notify-action-required:", error);
    return new Response(
      JSON.stringify({
        error: "Failed to process notifications",
        details: error.message,
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
