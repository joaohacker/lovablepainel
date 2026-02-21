import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const TIERS = [
  { credits: 100, price: 5.36 },
  { credits: 1000, price: 37.50 },
  { credits: 5000, price: 160.71 },
  { credits: 10000, price: 300.00 },
];

function calcularPreco(creditos: number): number {
  if (creditos <= 0) return 0;
  if (creditos <= TIERS[0].credits)
    return +(creditos * (TIERS[0].price / TIERS[0].credits)).toFixed(2);
  if (creditos >= TIERS[TIERS.length - 1].credits)
    return +(creditos * (TIERS[TIERS.length - 1].price / TIERS[TIERS.length - 1].credits)).toFixed(2);
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

// Settle a generation: mark settled, refund wallet (on-demand) or client_token credits
async function settleGeneration(
  supabase: ReturnType<typeof createClient>,
  gen: any,
  reason: string,
  forceStatus?: string
): Promise<{ id: string; user_id: string | null; refund: number; credits: number; reason: string } | null> {
  const earned = gen.credits_earned ?? 0;
  const requested = gen.credits_requested;
  const isClientToken = !!gen.client_token_id;
  const isOnDemand = !!gen.user_id && !isClientToken;

  // For completed with full delivery, just mark settled
  if (!forceStatus && gen.status === "completed" && earned >= requested) {
    await supabase.from("generations").update({ settled_at: new Date().toISOString() }).eq("id", gen.id).is("settled_at", null);
    return null;
  }

  // Calculate refund
  const refundCredits = requested - earned;

  // Mark as settled (with optional status override)
  const updateData: Record<string, any> = {
    settled_at: new Date().toISOString(),
    credits_earned: earned,
  };
  if (forceStatus) {
    updateData.status = forceStatus;
    updateData.error_message = `Cancelado automaticamente - ${reason}`;
  }

  const { data: updated, error: updateError } = await supabase
    .from("generations")
    .update(updateData)
    .eq("id", gen.id)
    .is("settled_at", null)
    .select("id")
    .maybeSingle();

  if (updateError || !updated) {
    console.log(`[auto-refund] Already settled: ${gen.id}`);
    return null;
  }

  // Refund based on type
  if (isOnDemand && gen.user_id) {
    // On-demand: refund wallet money
    const fullCost = calcularPreco(requested);
    const deliveredCost = earned > 0 ? calcularPreco(earned) : 0;
    const refundAmount = +(fullCost - deliveredCost).toFixed(2);

    if (refundAmount > 0) {
      const { error: refundError } = await supabase.rpc("credit_wallet", {
        p_user_id: gen.user_id,
        p_amount: refundAmount,
        p_description: earned > 0
          ? `Reembolso automático - ${earned}/${requested} créditos entregues (${forceStatus || gen.status})`
          : `Reembolso automático - geração ${forceStatus || gen.status} (${requested} créditos)`,
        p_reference_id: gen.farm_id,
      });

      if (refundError) {
        console.error(`[auto-refund] Wallet refund failed for ${gen.id}:`, refundError);
        await supabase.from("generations").update({ settled_at: null, ...(forceStatus ? { status: gen.status, error_message: null } : {}) }).eq("id", gen.id);
        return null;
      }
    }

    console.log(`[auto-refund] Wallet refund R$${refundAmount} to ${gen.user_id} (${reason}, ${earned}/${requested} credits)`);
    return { id: gen.id, user_id: gen.user_id, refund: refundAmount, credits: refundCredits, reason };
  }

  if (isClientToken && gen.client_token_id) {
    // Client link: refund credits back to client_token
    if (refundCredits > 0) {
      const { error: refundError } = await supabase.rpc("refund_client_token_credits", {
        p_token_id: gen.client_token_id,
        p_credits: refundCredits,
      });

      if (refundError) {
        console.error(`[auto-refund] Token credit refund failed for ${gen.id}:`, refundError);
        await supabase.from("generations").update({ settled_at: null, ...(forceStatus ? { status: gen.status, error_message: null } : {}) }).eq("id", gen.id);
        return null;
      }
    }

    console.log(`[auto-refund] Token credit refund ${refundCredits} credits to token ${gen.client_token_id} (${reason}, ${earned}/${requested})`);
    return { id: gen.id, user_id: gen.client_token_id, refund: refundCredits, credits: refundCredits, reason };
  }

  // No user_id and no client_token_id - just mark settled
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // SECURITY: Only allow cron (service role) or admin users
  const authHeader = req.headers.get("authorization");
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // SECURITY: Exact match — not includes (prevents substring bypass)
  const isServiceRole = authHeader === `Bearer ${supabaseServiceKey}`;

  if (!isServiceRole) {
    // If not service role, require admin auth
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Auth required" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Invalid user" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    const { data: roleCheck } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleCheck) {
      return new Response(JSON.stringify({ error: "Admin only" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const results: Array<{ id: string; user_id: string | null; refund: number; credits: number; reason: string }> = [];

    // ========================================================
    // 1) Auto-cancel waiting_invite stuck for > 10 minutes
    // ========================================================
    const waitingCutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    const { data: stuckWaiting, error: stuckError } = await supabase
      .from("generations")
      .select("id, farm_id, user_id, credits_requested, credits_earned, status, created_at, client_token_id")
      .is("settled_at", null)
      .eq("status", "waiting_invite")
      .lt("created_at", waitingCutoff)
      .limit(50);

    if (stuckError) console.error("[auto-refund] Error fetching stuck waiting_invite:", stuckError);

    if (stuckWaiting && stuckWaiting.length > 0) {
      for (const gen of stuckWaiting) {
        const result = await settleGeneration(supabase, gen, "waiting_invite_timeout", "cancelled");
        if (result) results.push(result);
      }
    }

    // ========================================================
    // 2) Refund expired/cancelled/error generations
    // ========================================================
    const expiredCutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    const { data: unsettled, error: fetchError } = await supabase
      .from("generations")
      .select("id, farm_id, user_id, credits_requested, credits_earned, status, created_at, client_token_id")
      .is("settled_at", null)
      .in("status", ["expired", "cancelled", "error"])
      .lt("created_at", expiredCutoff)
      .limit(50);

    if (fetchError) console.error("[auto-refund] Error fetching unsettled:", fetchError);

    if (unsettled && unsettled.length > 0) {
      for (const gen of unsettled) {
        const result = await settleGeneration(supabase, gen, gen.status);
        if (result) results.push(result);
      }
    }

    // ========================================================
    // 3) Settle completed generations (partial refund if needed)
    // ========================================================
    const { data: completed, error: completedError } = await supabase
      .from("generations")
      .select("id, farm_id, user_id, credits_requested, credits_earned, status, created_at, client_token_id")
      .is("settled_at", null)
      .eq("status", "completed")
      .limit(50);

    if (completedError) console.error("[auto-refund] Error fetching completed:", completedError);

    if (completed && completed.length > 0) {
      for (const gen of completed) {
        const result = await settleGeneration(supabase, gen, "partial_delivery");
        if (result) results.push(result);
      }
    }

    return new Response(
      JSON.stringify({ success: true, processed: results.length, refunds: results }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[auto-refund] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
