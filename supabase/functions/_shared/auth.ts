// Shared auth helper for edge functions.
//
// Project has been migrated to Supabase's JWT Signing Keys system, which means:
//   - SUPABASE_ANON_KEY is now the opaque sb_publishable_* value (legacy JWT slot,
//     locked from editing in the dashboard)
//   - SUPABASE_SERVICE_ROLE_KEY is now the opaque sb_secret_* value
//   - SUPABASE_PUBLISHABLE_KEYS and SUPABASE_SECRET_KEYS are JSON objects keyed by
//     name ({"default": "..."}) for rotation support
//   - SUPABASE_JWKS exposes the asymmetric public keys for JWT verification
//
// User-JWT validation must use supabase-js auth.getClaims() against JWKS, not the
// older getUser() flow (which hits /auth/v1/user with apikey validation that no
// longer works against opaque keys).
//
// Service-role detection must accept BOTH the new opaque sb_secret_* and any
// legacy HS256 service-role JWT still held by infra (notably n8n's "Set Credentials"
// node, which hardcodes the legacy JWT). A naive equality check against the
// current SUPABASE_SERVICE_ROLE_KEY misses the legacy case and causes regressions
// like the 2026-05-13 RAG pipeline failure where n8n's callback to index-document
// returned 401 "missing sub claim".

import { createClient } from "npm:@supabase/supabase-js@2";

export type AuthOk =
  | { ok: true; isServiceRole: true }
  | { ok: true; isServiceRole: false; userId: string };

export type AuthFail = {
  ok: false;
  status: number;
  body: { error: string; detail?: string };
};

export type AuthResult = AuthOk | AuthFail;

function getServiceRoleKeys(): string[] {
  const keys: string[] = [];
  const direct = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (direct) keys.push(direct);
  try {
    const json = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
    for (const v of Object.values(json)) {
      if (typeof v === "string" && !keys.includes(v)) keys.push(v);
    }
  } catch {
    // ignore — env var missing or malformed
  }
  return keys;
}

function getPublishableKey(): string {
  try {
    const json = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}");
    if (typeof json.default === "string") return json.default;
  } catch {
    // fall through to legacy slot
  }
  return Deno.env.get("SUPABASE_ANON_KEY") ?? "";
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

export async function authenticate(req: Request): Promise<AuthResult> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return { ok: false, status: 401, body: { error: "Not authenticated" } };
  }

  const token = authHeader.replace(/^Bearer\s+/i, "");

  // 1. Direct match against any known service-role key (opaque sb_secret_* or
  //    legacy HS256 service-role JWT pinned in env)
  for (const key of getServiceRoleKeys()) {
    if (token === key) return { ok: true, isServiceRole: true };
  }

  // 2. Decode payload of bearer token without signature verification. Legacy
  //    HS256 service-role JWTs held by n8n / other infra carry role=service_role
  //    but no sub claim. Treat them as service-role.
  if (token.startsWith("eyJ")) {
    const payload = decodeJwtPayload(token);
    if (payload && payload.role === "service_role") {
      return { ok: true, isServiceRole: true };
    }
  }

  // 3. User JWT — verify via JWKS using getClaims().
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAuth = createClient(supabaseUrl, getPublishableKey(), {
    global: { headers: { Authorization: authHeader } },
  });
  const { data, error } = await supabaseAuth.auth.getClaims(token);
  if (error || !data?.claims?.sub) {
    return {
      ok: false,
      status: 401,
      body: {
        error: "Not authenticated",
        detail: error?.message ?? "missing sub claim",
      },
    };
  }
  return { ok: true, isServiceRole: false, userId: data.claims.sub };
}
