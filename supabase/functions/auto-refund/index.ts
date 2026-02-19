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
    const results: Array<{ id: string; user_id: string; refund: number; credits: number; reason: string }> = [];

    // ========================================================
    // 1) Auto-cancel waiting_invite stuck for > 10 minutes
    // ========================================================
    const waitingCutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    const { data: stuckWaiting, error: stuckError } = await supabase
      .from("generations")
      .select("id, farm_id, user_id, credits_requested, credits_earned, status, created_at")
      .not("user_id", "is", null)
      .is("settled_at", null)
      .eq("status", "waiting_invite")
      .lt("created_at", waitingCutoff)
      .limit(50);

    if (stuckError) {
      console.error("[auto-refund] Error fetching stuck waiting_invite:", stuckError);
    }

    if (stuckWaiting && stuckWaiting.length > 0) {
      for (const gen of stuckWaiting) {
        // Mark as cancelled + settled atomically
        const { data: updated, error: updateError } = await supabase
          .from("generations")
          .update({
            status: "cancelled",
            settled_at: new Date().toISOString(),
            error_message: "Cancelado automaticamente - waiting_invite por mais de 10 minutos sem atividade",
          })
          .eq("id", gen.id)
          .is("settled_at", null)
          .select("id")
          .maybeSingle();

        if (updateError || !updated) {
          console.log(`[auto-refund] Already settled (waiting): ${gen.id}`);
          continue;
        }

        // Full refund since nothing was delivered
        const refundAmount = calcularPreco(gen.credits_requested);

        if (refundAmount > 0) {
          const { error: refundError } = await supabase.rpc("credit_wallet", {
            p_user_id: gen.user_id,
            p_amount: refundAmount,
            p_description: `Reembolso automático - geração cancelada (waiting_invite > 10min, ${gen.credits_requested} créditos)`,
            p_reference_id: gen.farm_id,
          });

          if (refundError) {
            console.error(`[auto-refund] Refund failed for waiting ${gen.id}:`, refundError);
            await supabase.from("generations").update({ settled_at: null, status: "waiting_invite", error_message: null }).eq("id", gen.id);
            continue;
          }
        }

        console.log(`[auto-refund] Cancelled waiting_invite & refunded R$${refundAmount} to ${gen.user_id} (${gen.credits_requested} credits, farm ${gen.farm_id})`);
        results.push({ id: gen.id, user_id: gen.user_id, refund: refundAmount, credits: gen.credits_requested, reason: "waiting_invite_timeout" });
      }
    }

    // ========================================================
    // 2) Refund expired/cancelled/error generations (full refund)
    // ========================================================
    const expiredCutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    const { data: unsettled, error: fetchError } = await supabase
      .from("generations")
      .select("id, farm_id, user_id, credits_requested, credits_earned, status, created_at")
      .not("user_id", "is", null)
      .is("settled_at", null)
      .in("status", ["expired", "cancelled", "error"])
      .lt("created_at", expiredCutoff)
      .limit(50);

    if (fetchError) {
      console.error("[auto-refund] Error fetching unsettled:", fetchError);
    }

    if (unsettled && unsettled.length > 0) {
      for (const gen of unsettled) {
        const earned = gen.credits_earned ?? 0;
        const requested = gen.credits_requested;

        const fullCost = calcularPreco(requested);
        const deliveredCost = earned > 0 ? calcularPreco(earned) : 0;
        const refundAmount = +(fullCost - deliveredCost).toFixed(2);

        if (refundAmount <= 0) {
          await supabase.from("generations").update({ settled_at: new Date().toISOString() }).eq("id", gen.id).is("settled_at", null);
          continue;
        }

        const { data: updated, error: updateError } = await supabase
          .from("generations")
          .update({ settled_at: new Date().toISOString(), credits_earned: earned })
          .eq("id", gen.id)
          .is("settled_at", null)
          .select("id")
          .maybeSingle();

        if (updateError || !updated) {
          console.log(`[auto-refund] Already settled: ${gen.id}`);
          continue;
        }

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
          await supabase.from("generations").update({ settled_at: null }).eq("id", gen.id);
          continue;
        }

        console.log(`[auto-refund] Refunded R$${refundAmount} to ${gen.user_id} for farm ${gen.farm_id} (${gen.status}, ${earned}/${requested} credits)`);
        results.push({ id: gen.id, user_id: gen.user_id, refund: refundAmount, credits: requested - earned, reason: gen.status });
      }
    }

    // ========================================================
    // 3) Settle completed on-demand generations (partial refund)
    //    Charge only for credits actually delivered
    // ========================================================
    const { data: completed, error: completedError } = await supabase
      .from("generations")
      .select("id, farm_id, user_id, credits_requested, credits_earned, status, created_at")
      .not("user_id", "is", null)
      .is("settled_at", null)
      .eq("status", "completed")
      .limit(50);

    if (completedError) {
      console.error("[auto-refund] Error fetching completed:", completedError);
    }

    if (completed && completed.length > 0) {
      for (const gen of completed) {
        const earned = gen.credits_earned ?? 0;
        const requested = gen.credits_requested;

        // If all credits delivered, just mark as settled (no refund needed)
        if (earned >= requested) {
          await supabase.from("generations").update({ settled_at: new Date().toISOString() }).eq("id", gen.id).is("settled_at", null);
          continue;
        }

        const fullCost = calcularPreco(requested);
        const deliveredCost = earned > 0 ? calcularPreco(earned) : 0;
        const refundAmount = +(fullCost - deliveredCost).toFixed(2);

        if (refundAmount <= 0) {
          await supabase.from("generations").update({ settled_at: new Date().toISOString() }).eq("id", gen.id).is("settled_at", null);
          continue;
        }

        const { data: updated, error: updateError } = await supabase
          .from("generations")
          .update({ settled_at: new Date().toISOString() })
          .eq("id", gen.id)
          .is("settled_at", null)
          .select("id")
          .maybeSingle();

        if (updateError || !updated) {
          console.log(`[auto-refund] Already settled (completed): ${gen.id}`);
          continue;
        }

        const { error: refundError } = await supabase.rpc("credit_wallet", {
          p_user_id: gen.user_id,
          p_amount: refundAmount,
          p_description: `Reembolso parcial - ${earned}/${requested} créditos entregues (completed)`,
          p_reference_id: gen.farm_id,
        });

        if (refundError) {
          console.error(`[auto-refund] Partial refund failed for ${gen.id}:`, refundError);
          await supabase.from("generations").update({ settled_at: null }).eq("id", gen.id);
          continue;
        }

        console.log(`[auto-refund] Partial refund R$${refundAmount} to ${gen.user_id} (${earned}/${requested} credits delivered, farm ${gen.farm_id})`);
        results.push({ id: gen.id, user_id: gen.user_id, refund: refundAmount, credits: requested - earned, reason: "partial_delivery" });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed: results.length,
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
