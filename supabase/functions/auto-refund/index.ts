import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const TIERS = [
  { credits: 100, price: 3.5 },
  { credits: 1000, price: 24.5 },
  { credits: 5000, price: 105.0 },
  { credits: 10000, price: 196.0 },
];

function calcularPreco(creditos: number): number {
  if (creditos <= 0) return 0;
  if (creditos <= TIERS[0].credits)
    return +(creditos * (TIERS[0].price / TIERS[0].credits)).toFixed(2);
  if (creditos >= TIERS[TIERS.length - 1].credits)
    return +(
      creditos *
      (TIERS[TIERS.length - 1].price / TIERS[TIERS.length - 1].credits)
    ).toFixed(2);
  for (let i = 0; i < TIERS.length - 1; i++) {
    if (
      creditos >= TIERS[i].credits &&
      creditos <= TIERS[i + 1].credits
    ) {
      const t =
        (creditos - TIERS[i].credits) /
        (TIERS[i + 1].credits - TIERS[i].credits);
      const unitLow = TIERS[i].price / TIERS[i].credits;
      const unitHigh = TIERS[i + 1].price / TIERS[i + 1].credits;
      const unit = unitLow + t * (unitHigh - unitLow);
      return +(creditos * unit).toFixed(2);
    }
  }
  return +(creditos * (TIERS[0].price / TIERS[0].credits)).toFixed(2);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Find all on-demand generations that expired/cancelled without settlement
    // Only process generations older than 10 minutes (avoid racing with active sessions)
    const cutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    const { data: unsettled, error: fetchError } = await supabase
      .from("generations")
      .select("id, farm_id, user_id, credits_requested, credits_earned, status, created_at")
      .not("user_id", "is", null)
      .is("settled_at", null)
      .in("status", ["expired", "cancelled", "error"])
      .lt("created_at", cutoff)
      .limit(50);

    if (fetchError) throw fetchError;

    if (!unsettled || unsettled.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No pending refunds", processed: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results: Array<{ id: string; user_id: string; refund: number; credits: number }> = [];

    for (const gen of unsettled) {
      const earned = gen.credits_earned ?? 0;
      const requested = gen.credits_requested;

      // Calculate refund: full cost minus cost of what was actually delivered
      const fullCost = calcularPreco(requested);
      const deliveredCost = earned > 0 ? calcularPreco(earned) : 0;
      const refundAmount = +(fullCost - deliveredCost).toFixed(2);

      if (refundAmount <= 0) {
        // Nothing to refund, just mark as settled
        await supabase
          .from("generations")
          .update({ settled_at: new Date().toISOString() })
          .eq("id", gen.id)
          .is("settled_at", null);
        continue;
      }

      // Atomically mark as settled first (prevents double-refund)
      const { data: updated, error: updateError } = await supabase
        .from("generations")
        .update({
          settled_at: new Date().toISOString(),
          credits_earned: earned,
        })
        .eq("id", gen.id)
        .is("settled_at", null)
        .select("id")
        .maybeSingle();

      if (updateError || !updated) {
        console.log(`[auto-refund] Already settled: ${gen.id}`);
        continue;
      }

      // Issue refund
      const description =
        earned > 0
          ? `Reembolso automático - ${earned}/${requested} créditos entregues (${gen.status})`
          : `Reembolso automático - geração ${gen.status} (${requested} créditos)`;

      const { error: refundError } = await supabase.rpc("credit_wallet", {
        p_user_id: gen.user_id,
        p_amount: refundAmount,
        p_description: description,
        p_reference_id: gen.farm_id,
      });

      if (refundError) {
        console.error(`[auto-refund] Refund failed for ${gen.id}:`, refundError);
        // Revert settlement so it can be retried
        await supabase
          .from("generations")
          .update({ settled_at: null })
          .eq("id", gen.id);
        continue;
      }

      console.log(
        `[auto-refund] Refunded R$${refundAmount} to ${gen.user_id} for farm ${gen.farm_id} (${gen.status}, ${earned}/${requested} credits)`
      );

      results.push({
        id: gen.id,
        user_id: gen.user_id,
        refund: refundAmount,
        credits: requested - earned,
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed: results.length,
        total_found: unsettled.length,
        refunds: results,
      }),
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
