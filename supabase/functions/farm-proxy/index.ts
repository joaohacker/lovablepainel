import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
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
 * Process the queue: when a slot opens, pick the oldest queued generation,
 * create a real farm, and update the generation record.
 */
async function processQueue(
  supabase: ReturnType<typeof createClient>,
  farmApiKey: string
) {
  const MAX_CONCURRENT = 8;
  const now = new Date();
  const tenMinAgo = new Date(now.getTime() - 10 * 60 * 1000).toISOString();
  const twelveMinAgo = new Date(now.getTime() - 12 * 60 * 1000).toISOString();
  const threeMinAgo = new Date(now.getTime() - 3 * 60 * 1000).toISOString();

  const { count: runC } = await supabase.from("generations").select("id", { count: "exact", head: true }).eq("status", "running").gte("updated_at", tenMinAgo);
  const { count: waitC } = await supabase.from("generations").select("id", { count: "exact", head: true }).eq("status", "waiting_invite").gte("created_at", twelveMinAgo);
  const { count: createC } = await supabase.from("generations").select("id", { count: "exact", head: true }).eq("status", "creating").gte("created_at", threeMinAgo);
  const activeCount = (runC || 0) + (waitC || 0) + (createC || 0);

  if (activeCount >= MAX_CONCURRENT) {
    console.log(`[processQueue] Still at capacity (${activeCount}/${MAX_CONCURRENT}), skipping`);
    return;
  }

  const { data: nextGen } = await supabase
    .from("generations")
    .select("id, farm_id, credits_requested, user_id, token_id, client_token_id, client_name")
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!nextGen) return;

  console.log(`[processQueue] Dequeuing generation ${nextGen.id} (${nextGen.credits_requested} credits)`);

  try {
    const farmRes = await fetch(`${API_BASE}/farm/create`, {
      method: "POST",
      headers: { "x-api-key": farmApiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ credits: nextGen.credits_requested }),
    });
    if (!farmRes.ok) {
      const errText = await farmRes.text();
      console.error(`[processQueue] Farm creation failed: ${errText}`);
      return;
    }
    const farmData = await farmRes.json();
    const oldFarmId = nextGen.farm_id;

    await supabase.from("generations")
      .update({ farm_id: farmData.farmId, status: "waiting_invite", master_email: farmData.masterEmail || null })
      .eq("id", nextGen.id).eq("status", "queued");

    if (nextGen.user_id && !nextGen.client_token_id) {
      const { data: wallet } = await supabase.from("wallets").select("id").eq("user_id", nextGen.user_id).single();
      if (wallet) {
        await supabase.from("wallet_transactions").update({ reference_id: farmData.farmId }).eq("wallet_id", wallet.id).eq("reference_id", oldFarmId);
      }
    }
    if (nextGen.token_id) {
      await supabase.from("token_usages").update({ farm_id: farmData.farmId, status: "active" }).eq("farm_id", oldFarmId).eq("token_id", nextGen.token_id);
    }
    console.log(`[processQueue] Dequeued gen ${nextGen.id}: ${oldFarmId} -> ${farmData.farmId}`);
  } catch (err) {
    console.error(`[processQueue] Error:`, err);
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

        // Handle queued placeholder farmIds — don't call upstream API
        if (farmId.startsWith("queued-")) {
          // First check if the generation still exists with the placeholder farm_id
          const { data: gen } = await supabase
            .from("generations")
            .select("id, farm_id, status, credits_requested, credits_earned, master_email, workspace_name, created_at, token_id")
            .eq("farm_id", farmId)
            .maybeSingle();

          if (gen) {
            if (gen.status === "queued") {
              // Still queued — return synthetic status with queue position
              const { count: queuePos } = await supabase
                .from("generations")
                .select("id", { count: "exact", head: true })
                .eq("status", "queued")
                .lte("created_at", gen.created_at);

              return new Response(
                JSON.stringify({
                  status: "queued",
                  queuePosition: queuePos || 1,
                  credits: gen.credits_requested,
                }),
                { headers: { ...corsHeaders, "Content-Type": "application/json" } }
              );
            }
            // Status changed but farm_id didn't (e.g. cancelled while still queued)
            return new Response(
              JSON.stringify({
                status: gen.status,
                credits: gen.credits_requested,
                masterEmail: gen.master_email,
              }),
              { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }

          // Generation no longer has the placeholder farm_id — it was dequeued by processQueue
          // Find the generation that was dequeued: use token from query param to narrow search
          let dequeued: any = null;

          if (token) {
            // Token-based: find by token_id
            const { data: tokenData } = await supabase
              .from("tokens")
              .select("id")
              .eq("token", token)
              .eq("is_active", true)
              .maybeSingle();

            if (tokenData) {
              const { data: found } = await supabase
                .from("generations")
                .select("farm_id, status, master_email, workspace_name, credits_requested, credits_earned")
                .eq("token_id", tokenData.id)
                .in("status", ["waiting_invite", "running", "completed", "cancelled", "error", "expired"])
                .not("farm_id", "like", "queued-%")
                .order("created_at", { ascending: false })
                .limit(1)
                .maybeSingle();
              dequeued = found;
            }
          }

          if (!dequeued) {
            // Fallback: generation may have been cancelled/settled
            return new Response(
              JSON.stringify({ status: "queued", queuePosition: 1 }),
              { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }

          // Return dequeued signal with the new real farmId
          return new Response(
            JSON.stringify({
              status: "dequeued",
              newFarmId: dequeued.farm_id,
              masterEmail: dequeued.master_email,
              workspaceName: dequeued.workspace_name,
              credits: dequeued.credits_requested,
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
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

    // === SYNC DB: update generation status/credits only when values change ===
    if (action === "status" && farmId && upstreamRes.ok) {
      try {
        const parsed = JSON.parse(data);

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

        // Map upstream status to our status values
        const upstreamStatus = parsed.status;
        const dbStatus = upstreamStatus === "workspace_detected" ? "running" 
          : upstreamStatus === "allocating" ? "waiting_invite"
          : upstreamStatus;

        if (upstreamStatus === "completed") {
          autoSettle(supabase, farmId, creditsEarned).catch((err) => {
            console.error(`[auto-settle] Error:`, err);
          });
          processQueue(supabase, FARM_API_KEY).catch((err) => {
            console.error(`[processQueue] Error:`, err);
          });
        } else if (["error", "expired", "cancelled"].includes(upstreamStatus)) {
          // Immediately settle and refund on error/expired/cancelled
          (async () => {
            try {
              const { data: gen } = await supabase
                .from("generations")
                .select("id, user_id, credits_requested, credits_earned, client_token_id")
                .eq("farm_id", farmId)
                .is("settled_at", null)
                .maybeSingle();

              if (gen) {
                const finalEarned = Math.min(creditsEarned, gen.credits_requested);

                const { data: updated } = await supabase
                  .from("generations")
                  .update({
                    status: upstreamStatus,
                    credits_earned: finalEarned,
                    settled_at: new Date().toISOString(),
                    error_message: parsed.error || parsed.message || `Geração ${upstreamStatus}`,
                  })
                  .eq("farm_id", farmId)
                  .is("settled_at", null)
                  .select("id")
                  .maybeSingle();

                if (updated) {
                  if (gen.user_id && !gen.client_token_id) {
                    // On-demand user: refund wallet
                    const fullCost = calcularPreco(gen.credits_requested);
                    const deliveredCost = finalEarned > 0 ? calcularPreco(finalEarned) : 0;
                    const refundAmount = +(fullCost - deliveredCost).toFixed(2);
                    if (refundAmount > 0) {
                      await supabase.rpc("credit_wallet", {
                        p_user_id: gen.user_id,
                        p_amount: refundAmount,
                        p_description: `Reembolso - geração ${upstreamStatus} (${finalEarned}/${gen.credits_requested} créditos)`,
                        p_reference_id: farmId,
                      });
                      console.log(`[farm-proxy] Refunded R$${refundAmount} for ${upstreamStatus} farmId=${farmId}`);
                    }
                  } else if (gen.client_token_id) {
                    // Client token: refund credits
                    const refundCredits = gen.credits_requested - finalEarned;
                    if (refundCredits > 0) {
                      await supabase.rpc("refund_client_token_credits", {
                        p_token_id: gen.client_token_id,
                        p_credits: refundCredits,
                      });
                      console.log(`[farm-proxy] Refunded ${refundCredits} token credits for ${upstreamStatus} farmId=${farmId}`);
                    }
                  }
                }
              }
            } catch (err) {
              console.error(`[farm-proxy] Error settling ${upstreamStatus}:`, err);
            }
          })();

          processQueue(supabase, FARM_API_KEY).catch((err) => {
            console.error(`[processQueue] Error:`, err);
          });
        }
        
        if (!["completed", "error", "expired", "cancelled"].includes(upstreamStatus)) {
          const updatePayload: Record<string, unknown> = {
            credits_earned: creditsEarned,
          };
          if (dbStatus && ["running", "waiting_invite", "queued", "error", "expired", "cancelled"].includes(dbStatus)) {
            updatePayload.status = dbStatus;
          }
          if (parsed.workspaceName) {
            updatePayload.workspace_name = parsed.workspaceName;
          }
          if (parsed.masterEmail) {
            updatePayload.master_email = parsed.masterEmail;
          }

          await supabase
            .from("generations")
            .update(updatePayload)
            .eq("farm_id", farmId)
            .is("settled_at", null);
        }
      } catch {
        // Parsing failed — not a JSON response, skip
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
