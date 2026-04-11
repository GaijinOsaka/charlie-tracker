/**
 * WhatsApp Data Retention Policy - GDPR Compliance Function
 *
 * Executes automatic deletion of WhatsApp public interactions older than 90 days.
 * Private interactions are retained indefinitely for audit purposes.
 * All deletions are logged in gdpr_deletion_log table for compliance reporting.
 *
 * Trigger: n8n webhook scheduled daily at 2 AM
 * Environment Variables:
 * - SUPABASE_URL: Your Supabase project URL
 * - SUPABASE_SERVICE_ROLE_KEY: Service role key for database operations
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.0";

interface RetentionResponse {
  success: boolean;
  message: string;
  data?: {
    recordsDeleted: number;
    affectedUsers: number;
    executionTime: string;
    complianceLogId?: string;
  };
  error?: string;
  timestamp: string;
}

/**
 * Execute the retention policy
 */
async function executeRetentionPolicy(
  retentionDays: number = 90
): Promise<RetentionResponse> {
  try {
    // Get environment variables
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      return {
        success: false,
        message: "Missing required environment variables",
        error:
          "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured",
        timestamp: new Date().toISOString(),
      };
    }

    // Create Supabase client with service role
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    // Get pre-deletion status
    const statusResponse = await supabase.rpc(
      "get_retention_policy_status",
      {
        retention_days: retentionDays,
      }
    );

    if (statusResponse.error) {
      return {
        success: false,
        message: "Failed to retrieve retention policy status",
        error: statusResponse.error.message,
        timestamp: new Date().toISOString(),
      };
    }

    const status = statusResponse.data?.[0];
    const eligibleForDeletion =
      status?.public_interactions_eligible_for_deletion || 0;

    console.log(`[Retention Policy] Status before deletion:`, {
      totalPublicInteractions: status?.public_interactions_total,
      eligibleForDeletion: eligibleForDeletion,
      totalPrivateInteractions: status?.private_interactions_total,
      retentionDays: retentionDays,
    });

    // If no records to delete, return early
    if (eligibleForDeletion === 0) {
      return {
        success: true,
        message: "No interactions eligible for deletion",
        data: {
          recordsDeleted: 0,
          affectedUsers: 0,
          executionTime: new Date().toISOString(),
        },
        timestamp: new Date().toISOString(),
      };
    }

    // Execute the deletion function
    const deleteResponse = await supabase.rpc(
      "delete_expired_whatsapp_interactions",
      {
        retention_days: retentionDays,
      }
    );

    if (deleteResponse.error) {
      return {
        success: false,
        message: "Failed to execute retention policy",
        error: deleteResponse.error.message,
        timestamp: new Date().toISOString(),
      };
    }

    const result = deleteResponse.data?.[0];

    // Get GDPR compliance report
    const reportResponse = await supabase.rpc("get_gdpr_compliance_report", {
      p_days: 90,
    });

    const report = reportResponse.data?.[0];

    return {
      success: true,
      message: `Retention policy executed successfully`,
      data: {
        recordsDeleted: result?.records_deleted || 0,
        affectedUsers: result?.affected_users || 0,
        executionTime: result?.execution_time || new Date().toISOString(),
      },
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[Retention Policy] Error:", errorMessage);

    return {
      success: false,
      message: "Unexpected error during retention policy execution",
      error: errorMessage,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Retrieve compliance status and history
 */
async function getComplianceStatus(): Promise<RetentionResponse> {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      return {
        success: false,
        message: "Missing required environment variables",
        error:
          "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured",
        timestamp: new Date().toISOString(),
      };
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    // Get current status
    const statusResponse = await supabase.rpc(
      "get_retention_policy_status"
    );

    // Get compliance report
    const reportResponse = await supabase.rpc("get_gdpr_compliance_report");

    if (statusResponse.error || reportResponse.error) {
      return {
        success: false,
        message: "Failed to retrieve compliance data",
        error: statusResponse.error?.message || reportResponse.error?.message,
        timestamp: new Date().toISOString(),
      };
    }

    return {
      success: true,
      message: "Compliance status retrieved",
      data: {
        recordsDeleted: reportResponse.data?.[0]?.total_records_deleted || 0,
        affectedUsers: reportResponse.data?.[0]?.total_users_affected || 0,
        executionTime:
          reportResponse.data?.[0]?.last_execution ||
          new Date().toISOString(),
      },
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    return {
      success: false,
      message: "Error retrieving compliance status",
      error: errorMessage,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Main handler
 */
Deno.serve(async (req) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Content-Type": "application/json",
  };

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Parse request body if present
    let action = "execute";
    let retentionDays = 90;

    if (req.method === "POST") {
      const body = await req.json();
      action = body.action || "execute";
      retentionDays = body.retention_days || 90;
    } else if (req.method === "GET") {
      const url = new URL(req.url);
      action = url.searchParams.get("action") || "execute";
      retentionDays = parseInt(
        url.searchParams.get("retention_days") || "90"
      );
    }

    let response: RetentionResponse;

    if (action === "status" || action === "compliance") {
      response = await getComplianceStatus();
    } else {
      response = await executeRetentionPolicy(retentionDays);
    }

    return new Response(JSON.stringify(response), {
      status: response.success ? 200 : 400,
      headers: corsHeaders,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    return new Response(
      JSON.stringify({
        success: false,
        message: "Unexpected error",
        error: errorMessage,
        timestamp: new Date().toISOString(),
      }),
      {
        status: 500,
        headers: corsHeaders,
      }
    );
  }
});
