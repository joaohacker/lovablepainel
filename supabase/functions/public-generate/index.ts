import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

// Queue position helper
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

// === PAYLOAD OBFUSCATION ===
function _dc(p: string): any { try { const a = p.split(''); for (let i = 0; i < a.length - 1; i += 2) [a[i], a[i+1]] = [a[i+1], a[i]]; return JSON.parse(decodeURIComponent(escape(atob(a.reverse().join(''))))); } catch { return null; } }
function _ec(d: any): string { const b = btoa(unescape(encodeURIComponent(JSON.stringify(d)))).split('').reverse(); for (let i = 0; i < b.length - 1; i += 2) [b[i], b[i+1]] = [b[i+1], b[i]]; return b.join(''); }

const _handler = async (req: Request): Promise<Response> => {
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
    const _jwt = authHeader.replace("Bearer ", "");
    const { data: _claims } = await userClient.auth.getClaims(_jwt);
    const user = _claims?.claims ? { id: _claims.claims.sub as string, email: (_claims.claims as any).email as string } : null;
    if (!user) {
      return new Response(JSON.stringify({ error: "Usuário não autenticado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

    // SECURITY: Check if user is banned
    const { data: isBanned } = await supabase.rpc("is_user_banned", { p_user_id: user.id });
    if (isBanned) {
      return new Response(JSON.stringify({ error: "⛔ Conta suspensa por violação dos termos de uso." }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // SECURITY: Check if IP is banned
    const { data: isIpBanned } = await supabase.rpc("is_ip_banned", { p_ip: clientIp });
    if (isIpBanned) {
      return new Response(JSON.stringify({ error: "⛔ Acesso bloqueado." }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // SECURITY: Rate limiting — 15 generations per 5 minutes
    const { data: rateCheck } = await supabase.rpc("check_rate_limit", {
      p_user_id: user.id,
      p_ip: clientIp,
      p_endpoint: "public-generate",
      p_max_requests: 15,
      p_window_seconds: 300,
    });
    if (rateCheck && !rateCheck.allowed) {
      return new Response(JSON.stringify({ error: "Muitas tentativas. Aguarde alguns minutos." }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ===== NIGHT MODE (BRT 00:00 - 10:00) =====
    // Admins bypass night mode
    const { data: isAdminUser } = await supabase.rpc("has_role", { _user_id: user.id, _role: "admin" });

    const nowUTC = new Date();
    const brtHour = (nowUTC.getUTCHours() - 3 + 24) % 24;
    const isNightMode = true; // FORÇADO: manutenção ativa manualmente
    if (isNightMode && !isAdminUser) {
      const next = new Date(nowUTC);
      next.setUTCHours(15, 0, 0, 0);
      if (nowUTC >= next) next.setUTCDate(next.getUTCDate() + 1);
      return new Response(JSON.stringify({
        error: "🌙 Gerações pausadas para encher o estoque. Voltamos às 12h (horário de Brasília)!",
        night_mode: true,
        resumes_at: next.toISOString(),
      }), {
        status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // ===========================================

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

    // ATOMIC concurrency check + insert (prevents race condition)
    const placeholderFarmId = `pending-${tempDebitRef}`;
    const { data: slotResult, error: slotError } = await supabase.rpc("try_start_generation", {
      p_farm_id: placeholderFarmId,
      p_client_name: user.email || "on-demand",
      p_credits_requested: credits,
      p_status: "waiting_invite",
      p_client_ip: clientIp,
      p_user_id: user.id,
      p_max_concurrent: MAX_CONCURRENT,
    });

    if (slotError) {
      console.error("[public-generate] try_start_generation error:", slotError);
      await supabase.rpc("credit_wallet", {
        p_user_id: user.id,
        p_amount: cost,
        p_description: `Reembolso - erro ao verificar fila`,
        p_reference_id: tempDebitRef,
      });
      return new Response(JSON.stringify({ error: "Erro ao verificar fila" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const slot = slotResult as { queued: boolean; generation_id: string; active_count: number; queue_position?: number };

    if (slot.queued) {
      // Update debit reference_id to placeholder farmId
      const { data: wallet } = await supabase.from("wallets").select("id").eq("user_id", user.id).single();
      if (wallet) {
        await supabase.from("wallet_transactions")
          .update({ reference_id: placeholderFarmId })
          .eq("wallet_id", wallet.id)
          .eq("reference_id", tempDebitRef);
      }

      console.log(`[public-generate] Queued: generationId=${slot.generation_id}, position=${slot.queue_position}, credits=${credits}`);

      return new Response(JSON.stringify({
        success: true,
        queued: true,
        queuePosition: slot.queue_position || 1,
        generationId: slot.generation_id,
        credits,
        cost,
        new_balance: result.new_balance,
      }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // NOT QUEUED: create farm immediately
    if (!farmApiKey) {
      // Refund if no API key — also delete the placeholder generation
      await supabase.from("generations").delete().eq("id", slot.generation_id);
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
      // Refund on farm creation failure — also delete the placeholder generation
      await supabase.from("generations").delete().eq("id", slot.generation_id);
      await supabase.rpc("credit_wallet", {
        p_user_id: user.id,
        p_amount: cost,
        p_description: `Reembolso - falha na geração de ${credits} créditos`,
        p_reference_id: tempDebitRef,
      });
      const err = await farmRes.text();
      const isStockError = farmRes.status === 503 || /stock|capacity|unavailable|no.*available|bot.*insufficient/i.test(err);
      const userMessage = isStockError
        ? "⏳ Estoque temporariamente esgotado. Aguarde alguns minutos e tente gerar novamente. Seu saldo foi reembolsado."
        : `Erro ao criar farm: ${err}`;
      return new Response(JSON.stringify({ error: userMessage, stock_error: isStockError, refunded: true }), {
        status: isStockError ? 503 : 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const farmData = await farmRes.json();

    // Update generation with real farmId and masterEmail
    await supabase.from("generations")
      .update({
        farm_id: farmData.farmId,
        master_email: farmData.masterEmail || null,
        status: farmData.queued ? "queued" : "waiting_invite",
      })
      .eq("id", slot.generation_id);

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
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  let _enc = false; let _rq = req;
  try { const _t = await req.clone().text(); if (_t) { const _j = JSON.parse(_t); if (_j?._p) { _enc = true; _rq = new Request(req.url, { method: req.method, headers: req.headers, body: JSON.stringify(_dc(_j._p)) }); } } } catch {}
  const _rs = await _handler(_rq);
  if (!_enc) return _rs;
  try { if (_rs.headers.get("content-type")?.includes("json")) { const _b = await _rs.json(); return new Response(JSON.stringify({ _r: _ec(_b) }), { status: _rs.status, headers: _rs.headers }); } } catch {}
  return _rs;
});
