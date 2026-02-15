import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const API_BASE = "https://api.lovablextensao.shop";

function calcularPreco(creditos: number): number {
  const pricePer100 =
    creditos >= 5000 ? 5.0 :
    creditos >= 3000 ? 5.5 :
    creditos >= 2000 ? 6.0 :
    creditos >= 1000 ? 6.5 : 7.0;
  return (creditos / 100) * pricePer100;
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

    const { credits } = await req.json();
    if (!credits || credits < 5 || credits > 5000 || credits % 5 !== 0) {
      return new Response(JSON.stringify({ error: "Créditos inválidos (5-5000, múltiplos de 5)" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cost = calcularPreco(credits);

    // Debit wallet atomically
    const { data: debitResult, error: debitError } = await supabase.rpc("debit_wallet", {
      p_user_id: user.id,
      p_amount: cost,
      p_credits: credits,
      p_description: `Geração de ${credits} créditos`,
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

    // Create farm via external API
    if (!farmApiKey) {
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
      });
      const err = await farmRes.text();
      return new Response(JSON.stringify({ error: `Erro ao criar farm: ${err}` }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const farmData = await farmRes.json();
    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

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

    // Update debit reference
    const { data: wallet } = await supabase.from("wallets").select("id").eq("user_id", user.id).single();
    if (wallet) {
      await supabase.from("wallet_transactions")
        .update({ reference_id: farmData.farmId })
        .eq("wallet_id", wallet.id)
        .eq("reference_id", null as any)
        .order("created_at", { ascending: false })
        .limit(1);
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
