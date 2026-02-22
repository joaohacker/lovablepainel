import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const API_BASE = "https://api.lovablextensao.shop";
const MAX_CONCURRENT = 8;

function calcularPreco(creditos: number): number {
  const TIERS = [
    { credits: 100, price: 5.36 },
    { credits: 1000, price: 37.50 },
    { credits: 5000, price: 160.71 },
    { credits: 10000, price: 300.00 },
  ];
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
 * Count active (non-ghost) generations.
 * Ghost filtering: only count if recently updated/created based on status.
 */
async function getActiveGenerationCount(supabase: ReturnType<typeof createClient>): Promise<number> {
  const now = new Date();
  const tenMinAgo = new Date(now.getTime() - 10 * 60 * 1000).toISOString();
  const twelveMinAgo = new Date(now.getTime() - 12 * 60 * 1000).toISOString();
  const threeMinAgo = new Date(now.getTime() - 3 * 60 * 1000).toISOString();

  // Running: updated in last 10 min
  const { count: runningCount } = await supabase
    .from("generations")
    .select("id", { count: "exact", head: true })
    .eq("status", "running")
    .gte("updated_at", tenMinAgo);

  // Waiting invite: created in last 12 min
  const { count: waitingCount } = await supabase
    .from("generations")
    .select("id", { count: "exact", head: true })
    .eq("status", "waiting_invite")
    .gte("created_at", twelveMinAgo);

  // Creating: created in last 3 min
  const { count: creatingCount } = await supabase
    .from("generations")
    .select("id", { count: "exact", head: true })
    .eq("status", "creating")
    .gte("created_at", threeMinAgo);

  return (runningCount || 0) + (waitingCount || 0) + (creatingCount || 0);
}

/**
 * Get queue position for a given generation.
 */
async function getQueuePosition(supabase: ReturnType<typeof createClient>, generationId: string): Promise<number> {
  const { data: gen } = await supabase
    .from("generations")
    .select("created_at")
    .eq("id", generationId)
    .single();

  if (!gen) return 0;

  const { count } = await supabase
    .from("generations")
    .select("id", { count: "exact", head: true })
    .eq("status", "queued")
    .lt("created_at", gen.created_at);

  return (count || 0) + 1;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const farmApiKey = Deno.env.get("FARM_API_KEY");
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Authenticate user
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Autenticação necessária" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Usuário não autenticado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

    const body = await req.json();
    const { credits, action } = body;

    // === CHECK-QUEUE: poll queue status by generationId ===
    if (action === "check-queue") {
      const { generationId } = body;
      if (!generationId) {
        return new Response(JSON.stringify({ error: "generationId obrigatório" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: gen } = await supabase
        .from("generations")
        .select("id, farm_id, status, master_email, credits_requested, created_at")
        .eq("id", generationId)
        .eq("user_id", user.id)
        .single();

      if (!gen) {
        return new Response(JSON.stringify({ error: "Geração não encontrada" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (gen.status === "queued") {
        const position = await getQueuePosition(supabase, gen.id);
        return new Response(JSON.stringify({
          status: "queued",
          queuePosition: position,
          generationId: gen.id,
        }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Generation has been dequeued — return farmId
      return new Response(JSON.stringify({
        status: gen.status,
        farmId: gen.farm_id,
        masterEmail: gen.master_email,
        generationId: gen.id,
        credits: gen.credits_requested,
      }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // === GENERATE ===
    if (!credits || credits < 5 || credits > 10000 || credits % 5 !== 0) {
      return new Response(JSON.stringify({ error: "Créditos inválidos (5-10000, múltiplos de 5)" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cost = calcularPreco(credits);

    // Generate a unique debit ref upfront
    const tempDebitRef = crypto.randomUUID();

    // Debit wallet atomically with temp reference
    const { data: debitResult, error: debitError } = await supabase.rpc("debit_wallet", {
      p_user_id: user.id,
      p_amount: cost,
      p_credits: credits,
      p_description: `Geração de ${credits} créditos`,
      p_reference_id: tempDebitRef,
    });

    if (debitError) {
      console.error("[public-generate] Debit error:", debitError);
      return new Response(JSON.stringify({ error: "Erro ao debitar saldo" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = debitResult as { success: boolean; error?: string; balance?: number; required?: number; new_balance?: number };
    if (!result.success) {
      return new Response(JSON.stringify({
        error: result.error,
        balance: result.balance,
        required: cost,
        insufficient: true,
      }), {
        status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check active generation count (with ghost filtering)
    const activeCount = await getActiveGenerationCount(supabase);

    if (activeCount >= MAX_CONCURRENT) {
      // QUEUE: insert generation with placeholder farm_id and queued status
      const placeholderFarmId = `queued-${tempDebitRef}`;
      const { data: insertedGen } = await supabase
        .from("generations")
        .insert({
          farm_id: placeholderFarmId,
          client_name: user.email || "on-demand",
          credits_requested: credits,
          status: "queued",
          client_ip: clientIp,
          user_id: user.id,
        })
        .select("id")
        .single();

      // Update debit reference_id to placeholder farmId
      const { data: wallet } = await supabase.from("wallets").select("id").eq("user_id", user.id).single();
      if (wallet) {
        await supabase.from("wallet_transactions")
          .update({ reference_id: placeholderFarmId })
          .eq("wallet_id", wallet.id)
          .eq("reference_id", tempDebitRef);
      }

      // Calculate queue position
      const queuePosition = insertedGen ? await getQueuePosition(supabase, insertedGen.id) : 1;

      console.log(`[public-generate] Queued: generationId=${insertedGen?.id}, position=${queuePosition}, credits=${credits}`);

      return new Response(JSON.stringify({
        success: true,
        queued: true,
        queuePosition,
        generationId: insertedGen?.id,
        credits,
        cost,
        new_balance: result.new_balance,
      }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // NOT QUEUED: create farm immediately
    if (!farmApiKey) {
      // Refund if no API key
      await supabase.rpc("credit_wallet", {
        p_user_id: user.id,
        p_amount: cost,
        p_description: `Reembolso - FARM_API_KEY não configurada`,
        p_reference_id: tempDebitRef,
      });
      return new Response(JSON.stringify({ error: "FARM_API_KEY not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const farmRes = await fetch(`${API_BASE}/farm/create`, {
      method: "POST",
      headers: { "x-api-key": farmApiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ credits }),
    });

    if (!farmRes.ok) {
      // Refund on farm creation failure
      await supabase.rpc("credit_wallet", {
        p_user_id: user.id,
        p_amount: cost,
        p_description: `Reembolso - falha na geração de ${credits} créditos`,
        p_reference_id: tempDebitRef,
      });
      const err = await farmRes.text();
      return new Response(JSON.stringify({ error: `Erro ao criar farm: ${err}` }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const farmData = await farmRes.json();

    // Insert generation with user_id
    await supabase.from("generations").insert({
      farm_id: farmData.farmId,
      client_name: user.email || "on-demand",
      credits_requested: credits,
      status: farmData.queued ? "queued" : "waiting_invite",
      master_email: farmData.masterEmail || null,
      client_ip: clientIp,
      user_id: user.id,
    });

    // Update debit reference_id from temp UUID to farmId
    const { data: wallet } = await supabase.from("wallets").select("id").eq("user_id", user.id).single();
    if (wallet) {
      await supabase.from("wallet_transactions")
        .update({ reference_id: farmData.farmId })
        .eq("wallet_id", wallet.id)
        .eq("reference_id", tempDebitRef);
    }

    return new Response(JSON.stringify({
      success: true,
      farmId: farmData.farmId,
      masterEmail: farmData.masterEmail || null,
      queued: farmData.queued || false,
      queuePosition: farmData.queuePosition || null,
      credits,
      cost,
      new_balance: result.new_balance,
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[public-generate] Error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
