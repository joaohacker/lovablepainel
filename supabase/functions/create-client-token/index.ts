import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  try {
    const { credits } = await req.json();

    // Validate credits
    if (!credits || typeof credits !== "number" || credits < 5 || credits > 10000 || credits % 5 !== 0) {
      return new Response(
        JSON.stringify({ error: "Créditos inválidos (5-10000, múltiplo de 5)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const serviceSupabase = createClient(supabaseUrl, supabaseServiceKey);

    // Authenticate user FIRST
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Não autenticado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Não autenticado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if user is banned (AFTER auth)
    const { data: isBanned } = await serviceSupabase.rpc("is_user_banned", { p_user_id: user.id });
    if (isBanned) {
      return new Response(
        JSON.stringify({ error: "⛔ Conta suspensa por violação dos termos de uso." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if IP is banned
    const clientIpCheck = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const { data: isIpBanned } = await serviceSupabase.rpc("is_ip_banned", { p_ip: clientIpCheck });
    if (isIpBanned) {
      return new Response(
        JSON.stringify({ error: "⛔ Acesso bloqueado." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Calculate price
    const price = calcularPreco(credits);

    // Debit wallet using service role

    const { data: debitResult, error: debitError } = await serviceSupabase.rpc("debit_wallet", {
      p_user_id: user.id,
      p_amount: price,
      p_credits: credits,
      p_description: `Link de créditos - ${credits} créditos`,
    });

    if (debitError) throw new Error(debitError.message);
    if (!debitResult?.success) {
      return new Response(
        JSON.stringify({
          error: debitResult?.error || "Saldo insuficiente",
          insufficient: true,
          balance: debitResult?.balance,
          required: price,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create client token (no expiration)
    const { data: token, error: tokenError } = await serviceSupabase
      .from("client_tokens")
      .insert({
        owner_id: user.id,
        total_credits: credits,
      })
      .select("id, token, total_credits")
      .single();

    if (tokenError) {
      // Refund on failure
      await serviceSupabase.rpc("credit_wallet", {
        p_user_id: user.id,
        p_amount: price,
        p_description: `Reembolso - falha ao criar link`,
      });
      throw new Error(tokenError.message);
    }

    console.log(`[create-client-token] Created token ${token.id} for user ${user.id}, ${credits} credits, cost R$${price}`);

    return new Response(
      JSON.stringify({
        success: true,
        token: token.token,
        total_credits: token.total_credits,
        cost: price,
        new_balance: debitResult.new_balance,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[create-client-token] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
