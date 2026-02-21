import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const ALLOWED_ORIGINS = [
  "https://painelcreditoslovbl.lovable.app",
  "https://id-preview--ea0a1e84-4673-4ceb-813b-b85a7cef0fd2.lovable.app",
];

function getCorsHeaders(req?: Request) {
  const origin = req?.headers.get("origin") || "";
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  };
}

const API_BASE = "https://api.lovablextensao.shop";

function calcularPreco(creditos: number): number {
  const TIERS = [
    { credits: 100, price: 5.36 },
    { credits: 1000, price: 37.50 },
    { credits: 5000, price: 160.71 },
    { credits: 10000, price: 300.00 },
  ];
  if (creditos <= 0) return 0;
  if (creditos <= TIERS[0].credits) return +(creditos * (TIERS[0].price / TIERS[0].credits));
  if (creditos >= TIERS[TIERS.length - 1].credits) return +(creditos * (TIERS[TIERS.length - 1].price / TIERS[TIERS.length - 1].credits));
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
  const farmApiKey = Deno.env.get("FARM_API_KEY");
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {

    // BLOQUEIO TEMPORÁRIO - apenas admin pode gerar
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "⚠️ Gerações temporariamente pausadas. Tente novamente em breve." }), {
        status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    console.log("[public-generate] user:", user?.id, user?.email);
    if (!user) {
      return new Response(JSON.stringify({ error: "⚠️ Gerações temporariamente pausadas." }), {
        status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if admin
    const { data: adminRole } = await supabase
      .from("user_roles")
      .select("id")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    // Allow admin OR whitelisted users
    const ALLOWED_USERS = [
      "b5501c63-4484-47a3-8d9d-7f3b129f7ab4", // admin
      "1b27824d-f72b-4b44-ae56-6b38e75c311e", // testecuzin@gmail.com
    ];

    console.log("[public-generate] adminRole:", !!adminRole, "inAllowed:", ALLOWED_USERS.includes(user.id));

    // Check if user is banned
    const { data: isBanned } = await supabase.rpc("is_user_banned", { p_user_id: user.id });
    if (isBanned) {
      return new Response(JSON.stringify({ error: "⛔ Conta suspensa por violação dos termos de uso." }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if IP is banned
    const clientIpCheck = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const { data: isIpBanned } = await supabase.rpc("is_ip_banned", { p_ip: clientIpCheck });
    if (isIpBanned) {
      return new Response(JSON.stringify({ error: "⛔ Acesso bloqueado." }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // RATE LIMITING: max 5 requests per 60 seconds per user
    const { data: rateCheck } = await supabase.rpc("check_rate_limit", {
      p_user_id: user.id,
      p_ip: clientIpCheck,
      p_endpoint: "public-generate",
      p_max_requests: 5,
      p_window_seconds: 60,
    });
    if (rateCheck && !(rateCheck as any).allowed) {
      return new Response(JSON.stringify({ error: "⚠️ Muitas tentativas. Aguarde um momento." }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!adminRole && !ALLOWED_USERS.includes(user.id)) {
      return new Response(JSON.stringify({ error: "⚠️ Gerações temporariamente pausadas. Tente novamente em breve." }), {
        status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // FIM BLOQUEIO TEMPORÁRIO
    // user já autenticado acima

    const { credits } = await req.json();
    if (!credits || credits < 5 || credits > 10000 || credits % 5 !== 0) {
      return new Response(JSON.stringify({ error: "Créditos inválidos (5-20000, múltiplos de 5)" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cost = calcularPreco(credits);

    // Generate idempotency key BEFORE debit to prevent double-spend
    const idempotencyKey = crypto.randomUUID();

    // Debit wallet atomically with idempotency key
    const { data: debitResult, error: debitError } = await supabase.rpc("debit_wallet", {
      p_user_id: user.id,
      p_amount: cost,
      p_credits: credits,
      p_description: `Geração de ${credits} créditos`,
      p_reference_id: idempotencyKey,
    });

    if (debitError) {
      console.error("[public-generate] Debit error:", debitError);
      return new Response(JSON.stringify({ error: "Erro ao debitar saldo" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = debitResult as { success: boolean; error?: string; balance?: number; required?: number; new_balance?: number; duplicate?: boolean };
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

    // Update debit reference_id from idempotencyKey to farmId (thread-safe via WHERE reference_id = idempotencyKey)
    const { data: wallet } = await supabase.from("wallets").select("id").eq("user_id", user.id).single();
    if (wallet) {
      await supabase.from("wallet_transactions")
        .update({ reference_id: farmData.farmId })
        .eq("wallet_id", wallet.id)
        .eq("reference_id", idempotencyKey);
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
