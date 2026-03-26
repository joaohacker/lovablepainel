import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const API_BASE = "https://api.lovablextensao.shop";

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

async function verifyUpstreamCredits(farmId: string, farmApiKey: string): Promise<number | null> {
  if (farmId.startsWith("queued-")) return null;
  try {
    const res = await fetch(`${API_BASE}/farm/status/${farmId}`, {
      headers: { "x-api-key": farmApiKey },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    
    let realCredits = data.creditsEarned ?? data.result?.credits ?? 0;
    if (realCredits === 0 && Array.isArray(data.logs)) {
      for (const log of data.logs) {
        if (log.type === "credit" && typeof log.message === "string") {
          const match = log.message.match(/^\+(\d+)\s/);
          if (match) realCredits += parseInt(match[1], 10);
        }
      }
    }
    return realCredits;
  } catch {
    return null;
  }
}

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

  if (!forceStatus && gen.status === "completed" && earned >= requested) {
    await supabase.from("generations").update({ settled_at: new Date().toISOString() }).eq("id", gen.id).is("settled_at", null);
    return null;
  }

  const refundCredits = requested - earned;

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

  if (isOnDemand && gen.user_id) {
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

  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const authHeader = req.headers.get("authorization");
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const isServiceRole = authHeader === `Bearer ${supabaseServiceKey}`;

  if (!isServiceRole) {
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
  const farmApiKey = Deno.env.get("FARM_API_KEY");

  try {
    // Check for manual complete action
    let body: any = {};
    try {
      body = await req.json();
    } catch { /* no body */ }

    // ========================================================
    // MANUAL COMPLETE: admin marks a specific generation as completed
    // ========================================================
    if (body?.action === "complete" && body?.generation_id) {
      const genId = body.generation_id;
      
      const { data: gen, error: genError } = await supabase
        .from("generations")
        .select("id, farm_id, user_id, credits_requested, credits_earned, status, client_token_id, token_id")
        .eq("id", genId)
        .maybeSingle();

      if (genError || !gen) {
        return new Response(
          JSON.stringify({ success: false, error: "Geração não encontrada" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const earned = gen.credits_earned ?? 0;

      // Sync upstream credits if possible
      if (farmApiKey && gen.farm_id && !gen.farm_id.startsWith("queued-")) {
        const upstreamCredits = await verifyUpstreamCredits(gen.farm_id, farmApiKey);
        if (upstreamCredits !== null) {
          const syncedEarned = Math.min(
            Math.max(upstreamCredits, earned),
            gen.credits_requested
          );
          if (syncedEarned !== earned) {
            await supabase.from("generations")
              .update({ credits_earned: syncedEarned })
              .eq("id", gen.id);
            gen.credits_earned = syncedEarned;
          }
        }
      }

      const finalEarned = gen.credits_earned ?? 0;

      // Mark as completed + settled
      const { error: updateErr } = await supabase
        .from("generations")
        .update({ 
          status: "completed", 
          settled_at: new Date().toISOString(), 
          credits_earned: finalEarned 
        })
        .eq("id", genId);

      if (updateErr) {
        return new Response(
          JSON.stringify({ success: false, error: updateErr.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Handle refund for partial delivery
      let refundAmount = 0;
      let refundCredits = 0;

      if (finalEarned < gen.credits_requested) {
        const isClientToken = !!gen.client_token_id;
        const isOnDemand = !!gen.user_id && !isClientToken;

        if (isOnDemand && gen.user_id) {
          const fullCost = calcularPreco(gen.credits_requested);
          const deliveredCost = finalEarned > 0 ? calcularPreco(finalEarned) : 0;
          refundAmount = +(fullCost - deliveredCost).toFixed(2);

          if (refundAmount > 0) {
            const { data: refundResult } = await supabase.rpc("credit_wallet", {
              p_user_id: gen.user_id,
              p_amount: refundAmount,
              p_description: `Reembolso admin - ${finalEarned}/${gen.credits_requested} créditos entregues`,
              p_reference_id: `admin-complete-${gen.farm_id}`,
            });

            if (refundResult && !(refundResult as any).success) {
              return new Response(
                JSON.stringify({ success: false, error: `Geração concluída mas reembolso falhou: ${(refundResult as any).error}` }),
                { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
              );
            }
          }
        } else if (isClientToken && gen.client_token_id) {
          refundCredits = gen.credits_requested - finalEarned;
          if (refundCredits > 0) {
            await supabase.rpc("refund_client_token_credits", {
              p_token_id: gen.client_token_id,
              p_credits: refundCredits,
            });
          }
        }
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          earned: finalEarned, 
          requested: gen.credits_requested,
          refund_amount: refundAmount,
          refund_credits: refundCredits,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ========================================================
    // AUTOMATIC REFUND PROCESSING (cron)
    // ========================================================
    const results: Array<{ id: string; user_id: string | null; refund: number; credits: number; reason: string }> = [];

    // 0) RUNNING GHOSTS
    if (farmApiKey) {
      const ghostCutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const ghostMaxAge = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      const { data: runningGhosts } = await supabase
        .from("generations")
        .select("id, farm_id, user_id, credits_requested, credits_earned, status, client_token_id")
        .is("settled_at", null)
        .eq("status", "running")
        .lt("updated_at", ghostCutoff)
        .gt("created_at", ghostMaxAge)
        .limit(20);

      if (runningGhosts && runningGhosts.length > 0) {
        for (const gen of runningGhosts) {
          const upstreamCredits = await verifyUpstreamCredits(gen.farm_id, farmApiKey);
          
          if (upstreamCredits !== null) {
            const syncedEarned = Math.min(
              Math.max(upstreamCredits, gen.credits_earned ?? 0),
              gen.credits_requested
            );
            
            await supabase.from("generations")
              .update({ credits_earned: syncedEarned })
              .eq("id", gen.id);
            
            gen.credits_earned = syncedEarned;
            
            console.log(`[auto-refund] Ghost ${gen.farm_id}: upstream=${upstreamCredits}, synced=${syncedEarned}/${gen.credits_requested}`);
          } else {
            console.log(`[auto-refund] Ghost ${gen.farm_id}: upstream unreachable, using DB credits_earned=${gen.credits_earned ?? 0}`);
            try {
              await supabase.from("fraud_attempts").insert({
                user_id: gen.user_id,
                ip_address: "auto-refund",
                action: "ghost_refund_no_upstream",
                details: {
                  farm_id: gen.farm_id,
                  credits_requested: gen.credits_requested,
                  credits_earned_db: gen.credits_earned ?? 0,
                  reason: "Upstream API unreachable during ghost refund — using DB value",
                },
              });
            } catch (_e) {
              // ignore logging failure
            }
          }

          const result = await settleGeneration(supabase, gen, "ghost_auto_cancel", "cancelled");
          if (result) results.push(result);
        }
      }
    }

    // 1) Auto-cancel waiting_invite stuck > 10 minutes
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

    // 2) Refund expired/cancelled/error generations
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

    // 3) Settle completed generations (partial refund if needed)
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
