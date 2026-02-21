import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://painelcreditoslovbl.lovable.app",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const API_BASE = "https://api.lovablextensao.shop";

// Same pricing tiers used in public-generate for consistency
const TIERS = [
  { credits: 100, price: 5.36 },
  { credits: 1000, price: 37.50 },
  { credits: 5000, price: 160.71 },
  { credits: 10000, price: 300.00 },
];

function calcularPreco(creditos: number): number {
  if (creditos <= 0) return 0;
  if (creditos <= TIERS[0].credits) return +(creditos * (TIERS[0].price / TIERS[0].credits)).toFixed(2);
  if (creditos >= TIERS[TIERS.length - 1].credits) return +(creditos * (TIERS[TIERS.length - 1].price / TIERS[TIERS.length - 1].credits)).toFixed(2);
  for (let i = 0; i < TIERS.length - 1; i++) {
    if (creditos >= TIERS[i].credits && creditos <= TIERS[i + 1].credits) {
      const t = (creditos - TIERS[i].credits) / (TIERS[i + 1].credits - TIERS[i].credits);
      const unitLow = TIERS[i].price / TIERS[i].credits;
      const unitHigh = TIERS[i + 1].price / TIERS[i + 1].credits;
      const unit = unitLow + t * (unitHigh - unitLow);
      return +(creditos * unit).toFixed(2);
    }
  }
  return +(creditos * (TIERS[0].price / TIERS[0].credits)).toFixed(2);
}

/**
 * Auto-settle: when a generation completes, refund the difference between
 * what was reserved (credits_requested) and what was actually earned.
 * Uses settled_at IS NULL as atomic guard against double-refunds.
 */
async function autoSettle(
  supabase: ReturnType<typeof createClient>,
  farmId: string,
  upstreamCreditsEarned: number
) {
  // Find the generation — only on-demand (user_id IS NOT NULL) and not yet settled
  const { data: gen } = await supabase
    .from("generations")
    .select("id, user_id, credits_requested, credits_earned, status, settled_at")
    .eq("farm_id", farmId)
    .not("user_id", "is", null)
    .is("settled_at", null)
    .maybeSingle();

  if (!gen || !gen.user_id) return;

  // Cap earned credits at requested
  const finalEarned = Math.min(
    Math.max(upstreamCreditsEarned, gen.credits_earned ?? 0),
    gen.credits_requested
  );

  // Atomically mark as settled to prevent double-refund
  const { data: updated, error: updateError } = await supabase
    .from("generations")
    .update({
      status: "completed",
      credits_earned: finalEarned,
      settled_at: new Date().toISOString(),
    })
    .eq("farm_id", farmId)
    .is("settled_at", null)
    .select("id")
    .maybeSingle();

  // If no row was updated, another process already settled it
  if (updateError || !updated) {
    console.log(`[auto-settle] Already settled or error for farmId=${farmId}`);
    return;
  }

  // Calculate refund if earned < requested
  const undelivered = gen.credits_requested - finalEarned;
  if (undelivered > 0) {
    const fullCost = calcularPreco(gen.credits_requested);
    const deliveredCost = calcularPreco(finalEarned);
    const refundAmount = +(fullCost - deliveredCost).toFixed(2);

    if (refundAmount > 0) {
      await supabase.rpc("credit_wallet", {
        p_user_id: gen.user_id,
        p_amount: refundAmount,
        p_description: `Reembolso parcial - ${finalEarned}/${gen.credits_requested} créditos entregues`,
        p_reference_id: farmId,
      });
      console.log(`[auto-settle] Refunded R$${refundAmount} for farmId=${farmId} (${finalEarned}/${gen.credits_requested} credits)`);
    }
  } else {
    console.log(`[auto-settle] Full delivery for farmId=${farmId} (${finalEarned}/${gen.credits_requested})`);
  }
}

/**
 * Validates that the request has a valid token+farmId pair or is an authenticated admin.
 */
async function authorizeRequest(
  req: Request,
  supabase: ReturnType<typeof createClient>,
  farmId: string | null,
  token: string | null
): Promise<{ authorized: true } | { authorized: false; response: Response }> {
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const jwt = authHeader.replace("Bearer ", "");
    const { data, error } = await supabase.auth.getUser(jwt);
    if (!error && data?.user) {
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

  if (token && farmId) {
    const { data: tokenData } = await supabase
      .from("tokens")
      .select("id, is_active")
      .eq("token", token)
      .eq("is_active", true)
      .maybeSingle();

    if (tokenData) {
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
    // Check if IP is banned
    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const { data: isIpBanned } = await supabase.rpc("is_ip_banned", { p_ip: clientIp });
    if (isIpBanned) {
      return new Response(
        JSON.stringify({ error: "⛔ Acesso bloqueado." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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

    if (action === "events") {
      return new Response(
        JSON.stringify({ error: "SSE endpoint deprecated. Use action=status for polling." }),
        { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // === PUBLIC: stock and status are read-only ===
    // === PROTECTED: cancel requires authorization ===
    if (action !== "stock" && action !== "status") {
      const auth = await authorizeRequest(req, supabase, farmId, token);
      if (!auth.authorized) {
        return auth.response;
      }
    }

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
          JSON.stringify({ error: "Invalid action. Use: stock, status, cancel" }),
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

    // === AUTO-SETTLE: when status returns "completed", settle the generation ===
    if (action === "status" && farmId && upstreamRes.ok) {
      try {
        const parsed = JSON.parse(data);
        if (parsed.status === "completed") {
          // Count credits from result or logs
          let creditsEarned = parsed.result?.credits ?? parsed.creditsEarned ?? 0;
          if (creditsEarned === 0 && Array.isArray(parsed.logs)) {
            for (const log of parsed.logs) {
              if (log.type === "credit") {
                const match = log.message?.match(/^\+(\d+)\s/);
                if (match) creditsEarned += parseInt(match[1], 10);
              }
            }
          }
          // Fire-and-forget settlement — don't block the response
          autoSettle(supabase, farmId, creditsEarned).catch((err) => {
            console.error(`[auto-settle] Error:`, err);
          });
        }
      } catch {
        // Parsing failed — not a JSON response, skip settlement
      }
    }

    return new Response(data, {
      status: upstreamRes.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[farm-proxy] error:", error);
    return new Response(
      JSON.stringify({ error: "Erro interno do servidor" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
