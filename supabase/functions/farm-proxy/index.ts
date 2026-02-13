import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const API_BASE = "https://api.lovablextensao.shop";

/**
 * Validates that the request has a valid token+farmId pair or is an authenticated admin.
 * Returns { authorized: true } or a Response to send back.
 */
async function authorizeRequest(
  req: Request,
  supabase: ReturnType<typeof createClient>,
  farmId: string | null,
  token: string | null
): Promise<{ authorized: true } | { authorized: false; response: Response }> {
  // Path 1: Admin auth via JWT
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const jwt = authHeader.replace("Bearer ", "");
    const { data, error } = await supabase.auth.getUser(jwt);
    if (!error && data?.user) {
      // Check if admin
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", data.user.id)
        .eq("role", "admin")
        .maybeSingle();
      if (roleData) {
        return { authorized: true };
      }
    }
  }

  // Path 2: Token + farmId validation (client accessing their own session)
  if (token && farmId) {
    const { data: tokenData } = await supabase
      .from("tokens")
      .select("id, is_active")
      .eq("token", token)
      .eq("is_active", true)
      .maybeSingle();

    if (tokenData) {
      // Verify this farmId belongs to this token
      const { data: gen } = await supabase
        .from("generations")
        .select("id")
        .eq("farm_id", farmId)
        .eq("token_id", tokenData.id)
        .maybeSingle();

      if (gen) {
        return { authorized: true };
      }
    }
  }

  return {
    authorized: false,
    response: new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    ),
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const FARM_API_KEY = Deno.env.get("FARM_API_KEY");
  if (!FARM_API_KEY) {
    return new Response(
      JSON.stringify({ error: "FARM_API_KEY not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action");
    const farmId = url.searchParams.get("farmId");
    const token = url.searchParams.get("token");

    // === BLOCKED: create must go through validate-token ===
    if (action === "create") {
      return new Response(
        JSON.stringify({ error: "Use validate-token endpoint for farm creation" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // === PUBLIC: stock and status are read-only, farmId is UUID (not guessable) ===
    // === PROTECTED: cancel and events require authorization ===
    if (action !== "stock" && action !== "status") {
      const auth = await authorizeRequest(req, supabase, farmId, token);
      if (!auth.authorized) {
        return auth.response;
      }
    }

    // SSE streaming endpoint
    if (action === "events" && farmId) {
      const upstreamUrl = `${API_BASE}/farm/events/${farmId}?apiKey=${FARM_API_KEY}`;
      const upstreamRes = await fetch(upstreamUrl);

      if (!upstreamRes.ok) {
        const errBody = await upstreamRes.text();
        return new Response(
          JSON.stringify({ error: `Upstream error: ${upstreamRes.status}`, details: errBody }),
          { status: upstreamRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { readable, writable } = new TransformStream();
      const writer = writable.getWriter();
      const reader = upstreamRes.body!.getReader();

      (async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            await writer.write(value);
          }
        } catch (e) {
          console.error("SSE stream error:", e);
        } finally {
          try { writer.close(); } catch {}
        }
      })();

      return new Response(readable, {
        headers: {
          ...corsHeaders,
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
        },
      });
    }

    // Regular API proxy endpoints
    let upstreamUrl: string;
    let method = "GET";
    let body: string | undefined;

    switch (action) {
      case "stock":
        upstreamUrl = `${API_BASE}/farm/stock`;
        break;

      case "status": {
        if (!farmId) {
          return new Response(
            JSON.stringify({ error: "farmId is required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        upstreamUrl = `${API_BASE}/farm/status/${farmId}`;
        break;
      }

      case "cancel": {
        if (!farmId) {
          return new Response(
            JSON.stringify({ error: "farmId is required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        upstreamUrl = `${API_BASE}/farm/cancel/${farmId}`;
        method = "POST";
        break;
      }

      default:
        return new Response(
          JSON.stringify({ error: "Invalid action. Use: stock, status, cancel, events" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    const headers: Record<string, string> = {
      "x-api-key": FARM_API_KEY,
      "Content-Type": "application/json",
    };

    console.log(`[farm-proxy] ${method} ${upstreamUrl}`);

    const upstreamRes = await fetch(upstreamUrl, {
      method,
      headers,
      body: method === "POST" ? body : undefined,
    });

    const data = await upstreamRes.text();
    console.log(`[farm-proxy] upstream responded: ${upstreamRes.status}`);

    return new Response(data, {
      status: upstreamRes.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[farm-proxy] error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
