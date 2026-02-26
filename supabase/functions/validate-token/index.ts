import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const API_BASE = "https://api.lovablextensao.shop";

// === INPUT SANITIZATION ===
// Strips HTML tags, control characters, and trims to max length
function _sanitize(input: string, maxLen = 200): string {
  return input
    .replace(/<[^>]*>/g, '')           // strip HTML tags
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // strip control chars
    .trim()
    .slice(0, maxLen);
}
// Escapes ILIKE special characters to prevent pattern injection
function _escapeIlike(input: string): string {
  return input.replace(/[%_\\]/g, '\\$&');
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
    // ===== MAINTENANCE MODE =====
    // Block all generation until this time (UTC). Remove or set to past date to disable.
    const MAINTENANCE_UNTIL = "2099-12-31T23:59:59Z"; // BLOQUEIO TOTAL — exploits detectados
    const MAINTENANCE_MSG = "🔧 Atualizando painel com melhorias. Aguarde alguns minutos!";
    // Tokens allowed to bypass maintenance (for testing) - loaded from env
    const MAINTENANCE_BYPASS_TOKENS: string[] = (Deno.env.get("MAINTENANCE_BYPASS_TOKENS") || "").split(",").filter(Boolean);
    // Tokens that should NOT show "painel por demanda" info in maintenance banner
    // Loaded from env var for security (no hardcoded tokens in source)
    const HIDE_DEMAND_INFO_TOKENS: string[] = (Deno.env.get("HIDE_DEMAND_INFO_TOKENS") || "").split(",").filter(Boolean);
    // ============================

    // ===== NIGHT MODE (BRT 00:00 - 07:00) =====
    const nowUTC = new Date();
    // BRT = UTC-3
    const brtHour = (nowUTC.getUTCHours() - 3 + 24) % 24;
    const isNightMode = brtHour >= 0 && brtHour < 7;
    const NIGHT_MSG = "🌙 Geração desativada entre 00:00 e 07:00 no horário de Brasília para manter bots no estoque. Volte às 7h (horário de Brasília)!";
    // Next 7:00 BRT in UTC for countdown
    const getNext7amBRT = () => {
      const next = new Date(nowUTC);
      // 7:00 BRT = 10:00 UTC
      next.setUTCHours(10, 0, 0, 0);
      if (nowUTC >= next) next.setUTCDate(next.getUTCDate() + 1);
      return next.toISOString();
    };
    // ===========================================

    // Capture client IP from request headers
    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      || req.headers.get("x-real-ip")
      || req.headers.get("cf-connecting-ip")
      || "unknown";

    // Check if IP is banned
    const { data: isIpBanned } = await supabase.rpc("is_ip_banned", { p_ip: clientIp });
    if (isIpBanned) {
      return new Response(JSON.stringify({ valid: false, error: "⛔ Acesso bloqueado." }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // SECURITY: Rate limiting — 30 requests per minute per IP
    const { data: rateCheck } = await supabase.rpc("check_rate_limit", {
      p_user_id: "00000000-0000-0000-0000-000000000000",
      p_ip: clientIp,
      p_endpoint: "validate-token",
      p_max_requests: 60,
      p_window_seconds: 60,
    });
    if (rateCheck && !rateCheck.allowed) {
      return new Response(JSON.stringify({ valid: false, error: "Muitas requisições. Aguarde." }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { token, action, credits, farmId: bodyFarmId, status: bodyStatus, credits_earned, master_email, workspace_name, error_message } = body;

    // Input validation
    const VALID_ACTIONS = ["validate", "create", "update-status", "refund-expired", "sync-status"];
    if (action && !VALID_ACTIONS.includes(action)) {
      return new Response(
        JSON.stringify({ error: "Ação inválida" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (token && token !== "__public__" && (typeof token !== "string" || !/^[a-f0-9]{32}$/.test(token))) {
      return new Response(
        JSON.stringify({ valid: false, error: "Token inválido" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (credits !== undefined && (typeof credits !== "number" || credits < 5 || credits > 10000 || credits % 5 !== 0)) {
      return new Response(
        JSON.stringify({ error: "Créditos inválidos" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!token) {
      return new Response(
        JSON.stringify({ valid: false, error: "Token não fornecido" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Handle __public__ token for on-demand actions
    if (token === "__public__" && (action === "update-status" || action === "refund-expired")) {
      const farmId = bodyFarmId;
      const status = bodyStatus;

      if (!farmId) {
        return new Response(
          JSON.stringify({ success: false, error: "farmId required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // SECURITY: Require authentication — no anonymous fallback
      const authHeader = req.headers.get("authorization");
      if (!authHeader) {
        return new Response(
          JSON.stringify({ success: false, error: "Auth required" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user } } = await userClient.auth.getUser();
      if (!user) {
        return new Response(
          JSON.stringify({ success: false, error: "Invalid user" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // SECURITY: Only allow updating YOUR OWN generation
      const { data: gen } = await supabase
        .from("generations")
        .select("id, credits_requested, credits_earned, status")
        .eq("farm_id", farmId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (!gen) {
        return new Response(
          JSON.stringify({ success: false, error: "Generation not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // === REFUND-EXPIRED: refund wallet if generation never started running ===
      if (action === "refund-expired") {
        // Only refund if generation never earned credits (never ran)
        if ((gen.credits_earned || 0) > 0) {
          return new Response(
            JSON.stringify({ success: false, error: "Generation already earned credits, cannot refund" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        // Only refund if status is still pre-running
        if (!["waiting_invite", "queued", "creating", "expired"].includes(gen.status)) {
          return new Response(
            JSON.stringify({ success: false, error: "Generation already started, cannot refund" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Calculate refund amount using same pricing as public-generate
        const TIERS = [
          { credits: 100, price: 5.36 },
          { credits: 1000, price: 37.50 },
          { credits: 5000, price: 160.71 },
          { credits: 10000, price: 300.00 },
        ];
        const creditos = gen.credits_requested;
        let refundAmount = 0;
        if (creditos <= TIERS[0].credits) {
          refundAmount = +(creditos * (TIERS[0].price / TIERS[0].credits)).toFixed(2);
        } else if (creditos >= TIERS[TIERS.length - 1].credits) {
          refundAmount = +(creditos * (TIERS[TIERS.length - 1].price / TIERS[TIERS.length - 1].credits)).toFixed(2);
        } else {
          for (let i = 0; i < TIERS.length - 1; i++) {
            if (creditos >= TIERS[i].credits && creditos <= TIERS[i + 1].credits) {
              const t = (creditos - TIERS[i].credits) / (TIERS[i + 1].credits - TIERS[i].credits);
              const unitLow = TIERS[i].price / TIERS[i].credits;
              const unitHigh = TIERS[i + 1].price / TIERS[i + 1].credits;
              const unit = unitLow + t * (unitHigh - unitLow);
              refundAmount = +(creditos * unit).toFixed(2);
              break;
            }
          }
        }

        // SECURITY: Atomically mark as settled first to prevent double-refund
        const { data: settledGen } = await supabase
          .from("generations")
          .update({
            status: "expired",
            settled_at: new Date().toISOString(),
            error_message: "Expirou sem detectar workspace - créditos reembolsados",
          })
          .eq("farm_id", farmId)
          .eq("user_id", user.id)
          .is("settled_at", null)
          .select("id")
          .maybeSingle();

        if (!settledGen) {
          // Already settled by another process — no double refund
          return new Response(
            JSON.stringify({ success: true, refunded: 0, credits: creditos, already_settled: true }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        if (refundAmount > 0) {
          await supabase.rpc("credit_wallet", {
            p_user_id: user.id,
            p_amount: refundAmount,
            p_description: `Reembolso automático - geração de ${creditos} créditos expirou sem iniciar`,
            p_reference_id: farmId,
          });
        }

        console.log(`[refund-expired] Refunded R$${refundAmount} for ${creditos} credits, farmId=${farmId}, userId=${user.id}`);

        return new Response(
          JSON.stringify({ success: true, refunded: refundAmount, credits: creditos }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // === UPDATE-STATUS (original logic) ===
      const updateData: Record<string, unknown> = { status };
      if (master_email !== undefined) updateData.master_email = _sanitize(String(master_email), 200);
      if (workspace_name !== undefined) updateData.workspace_name = _sanitize(String(workspace_name), 200);
      if (error_message !== undefined) updateData.error_message = _sanitize(String(error_message), 500);

      // Never overwrite credits_earned with a lower value, cap at credits_requested
      if (credits_earned !== undefined && credits_earned > 0) {
        const dbCredits = gen.credits_earned ?? 0;
        const capCredits = gen.credits_requested ?? Infinity;
        updateData.credits_earned = Math.min(Math.max(credits_earned, dbCredits), capCredits);
      }

      // SECURITY: Only update YOUR OWN generation
      await supabase
        .from("generations")
        .update(updateData)
        .eq("farm_id", farmId)
        .eq("user_id", user.id);

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch token from DB
    const { data: tokenData, error: tokenError } = await supabase
      .from("tokens")
      .select("*")
      .eq("token", token)
      .single();

    if (tokenError || !tokenData) {
      return new Response(
        JSON.stringify({ valid: false, error: "Token inválido" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // === ADMIN: sync-status checks real API and updates DB ===
    if (action === "sync-status") {
      const farmId = bodyFarmId;
      if (!farmId || !farmApiKey) {
        return new Response(
          JSON.stringify({ success: false, error: "farmId and FARM_API_KEY required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check admin auth
      const authHeader = req.headers.get("authorization");
      if (!authHeader) {
        return new Response(JSON.stringify({ success: false, error: "Auth required" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user } } = await userClient.auth.getUser();
      if (!user) {
        return new Response(JSON.stringify({ success: false, error: "Invalid user" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const { data: roleData } = await supabase.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
      if (!roleData) {
        return new Response(JSON.stringify({ success: false, error: "Admin only" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Fetch real status from external API
      try {
        const statusRes = await fetch(`${API_BASE}/farm/status/${farmId}`, {
          headers: { "x-api-key": farmApiKey },
        });
        if (!statusRes.ok) {
          return new Response(JSON.stringify({ success: false, error: `API returned ${statusRes.status}` }),
            { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        const real = await statusRes.json();
        // creditsEarned may be null for multi-batch — count from logs
        let realCredits = real.creditsEarned ?? real.result?.credits ?? null;
        if (realCredits === null && Array.isArray(real.logs)) {
          realCredits = 0;
          for (const log of real.logs) {
            if (log.type === "credit" && typeof log.message === "string") {
              const match = log.message.match(/^\+(\d+)\s/);
              if (match) realCredits += parseInt(match[1], 10);
            }
          }
        }
        if (realCredits === null) realCredits = 0;
        const realStatus = real.status === "completed" ? "completed" : real.status === "error" ? "error" : real.status;

        // Never overwrite with lower value — fetch current DB value first
        const { data: currentGen } = await supabase.from("generations").select("credits_earned, credits_requested").eq("farm_id", farmId).maybeSingle();
        const dbCredits = currentGen?.credits_earned ?? 0;
        const capCredits = currentGen?.credits_requested ?? Infinity;
        const finalCredits = Math.min(Math.max(realCredits, dbCredits), capCredits);

        await supabase.from("generations").update({
          status: realStatus,
          credits_earned: finalCredits,
          master_email: real.masterEmail || undefined,
          workspace_name: real.workspaceName || undefined,
        }).eq("farm_id", farmId);

        await supabase.from("token_usages").update({
          status: realStatus,
          credits_earned: finalCredits,
          completed_at: ["completed", "error", "expired", "cancelled"].includes(realStatus) ? new Date().toISOString() : undefined,
        }).eq("farm_id", farmId);

        return new Response(JSON.stringify({ success: true, status: realStatus, credits_earned: finalCredits }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      } catch (e) {
        return new Response(JSON.stringify({ success: false, error: "Failed to reach external API" }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // === FAST PATH: update-status skips heavy validation ===
    if (action === "update-status") {
      const farmId = bodyFarmId;
      const status = bodyStatus;

      if (!farmId) {
        return new Response(
          JSON.stringify({ success: false, error: "farmId required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // On-demand generations use "__public__" as token — match by farm_id + user_id
      const isPublic = token === "__public__";
      let genFound = false;

      if (isPublic) {
        // SECURITY: Always require authentication for __public__ token updates
        const authHeader = req.headers.get("authorization");
        if (!authHeader) {
          return new Response(
            JSON.stringify({ success: false, error: "Auth required" }),
            { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
        const userClient = createClient(supabaseUrl, anonKey, {
          global: { headers: { Authorization: authHeader } },
        });
        const { data: { user } } = await userClient.auth.getUser();
        if (!user) {
          return new Response(
            JSON.stringify({ success: false, error: "Invalid user" }),
            { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        const { data: gen } = await supabase
          .from("generations")
          .select("id")
          .eq("farm_id", farmId)
          .eq("user_id", user.id)
          .maybeSingle();
        genFound = !!gen;
      } else {
        const { data: gen } = await supabase
          .from("generations")
          .select("id")
          .eq("farm_id", farmId)
          .eq("token_id", tokenData.id)
          .maybeSingle();
        genFound = !!gen;
      }

      if (!genFound) {
        return new Response(
          JSON.stringify({ success: false, error: "Generation not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // SECURITY: Whitelist allowed status values
      // NOTE: "completed" is intentionally EXCLUDED — only backend (farm-proxy/auto-refund/sync-status) can mark completed
      const ALLOWED_STATUSES = ["running", "expired", "cancelled", "error", "waiting_invite", "queued", "creating", "active"];
      if (status && !ALLOWED_STATUSES.includes(status)) {
        return new Response(
          JSON.stringify({ success: false, error: "Status inválido" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // SECURITY: Block frontend from setting terminal statuses on running generations with earned credits
      if (status && ["cancelled", "expired", "error"].includes(status)) {
        const { data: currentGenCheck } = await supabase
          .from("generations")
          .select("status, credits_earned")
          .eq("farm_id", farmId)
          .maybeSingle();

        if (currentGenCheck && currentGenCheck.status === "running") {
          return new Response(
            JSON.stringify({ success: false, error: "Não é possível cancelar geração em execução pelo frontend" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        if (currentGenCheck && (currentGenCheck.credits_earned ?? 0) > 0) {
          return new Response(
            JSON.stringify({ success: false, error: "Geração já recebeu créditos, cancelamento bloqueado" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      const updateData: Record<string, unknown> = {};
      if (status) updateData.status = status;
      if (master_email !== undefined && typeof master_email === "string" && master_email.length <= 200) updateData.master_email = master_email;
      if (workspace_name !== undefined && typeof workspace_name === "string" && workspace_name.length <= 200) updateData.workspace_name = workspace_name;
      if (error_message !== undefined && typeof error_message === "string" && error_message.length <= 500) updateData.error_message = error_message;

      // SECURITY: credits_earned — never decrease, cap at credits_requested, validate type
      if (credits_earned !== undefined && typeof credits_earned === "number" && credits_earned > 0 && Number.isInteger(credits_earned)) {
        const { data: currentGen } = await supabase.from("generations").select("credits_earned, credits_requested").eq("farm_id", farmId).maybeSingle();
        const dbCredits = currentGen?.credits_earned ?? 0;
        const capCredits = currentGen?.credits_requested ?? Infinity;
        updateData.credits_earned = Math.min(Math.max(credits_earned, dbCredits), capCredits);
      }

      // SECURITY: Filter by token_id to prevent cross-token manipulation
      if (isPublic) {
        // For __public__ tokens, this path shouldn't be reached (handled above)
        // but add safety filter anyway
        await supabase
          .from("generations")
          .update(updateData)
          .eq("farm_id", farmId)
          .is("token_id", null);
      } else {
        await supabase
          .from("generations")
          .update(updateData)
          .eq("farm_id", farmId)
          .eq("token_id", tokenData.id);
      }

      // Only update token_usages for token-based generations
      if (!isPublic) {
        const usageUpdate: Record<string, unknown> = { status: status || "active" };
        if (status === "completed") {
          if (credits_earned !== undefined) usageUpdate.credits_earned = credits_earned;
          usageUpdate.completed_at = new Date().toISOString();
        } else if (status === "error" || status === "cancelled" || status === "expired") {
          usageUpdate.credits_earned = 0;
          usageUpdate.completed_at = new Date().toISOString();
        }
        await supabase
          .from("token_usages")
          .update(usageUpdate)
          .eq("farm_id", farmId)
          .eq("token_id", tokenData.id);
      }

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if active
    if (!tokenData.is_active) {
      const deactivatedMsg = tokenData.warning_message
        ? `Este token foi desativado. ${tokenData.warning_message}`
        : "Este token foi desativado";
      return new Response(
        JSON.stringify({ valid: false, error: deactivatedMsg }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check expiration
    if (tokenData.expires_at && new Date(tokenData.expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ valid: false, error: "Este token expirou" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Auto-close stale sessions (running/active > 10 min) so their credits don't block
    const staleThreshold = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data: staleSessions } = await supabase
      .from("token_usages")
      .select("id, credits_earned, farm_id")
      .eq("token_id", tokenData.id)
      .in("status", ["active", "running"])
      .lt("created_at", staleThreshold);

    if (staleSessions && staleSessions.length > 0) {
      for (const s of staleSessions) {
        await supabase
          .from("token_usages")
          .update({ status: "completed", completed_at: new Date().toISOString() })
          .eq("id", s.id);
        // Also update generations table
        if (s.farm_id) {
          await supabase
            .from("generations")
            .update({ status: "completed" })
            .eq("farm_id", s.farm_id);
        }
      }
    }

    // Check total limit using generations table (has accurate credits_earned)
    let remainingTotal: number | null = null;
    if (tokenData.total_limit) {
      // Sum credits_earned from completed/running generations (actual earned credits)
      const { data: earnedTotal } = await supabase
        .from("generations")
        .select("credits_earned")
        .eq("token_id", tokenData.id)
        .in("status", ["completed", "running"]);
      const usedTotal = (earnedTotal || []).reduce((sum, r) => sum + (r.credits_earned || 0), 0);

      // Sum credits_requested from in-progress generations (reserved)
      const { data: activeTotal } = await supabase
        .from("generations")
        .select("credits_requested")
        .eq("token_id", tokenData.id)
        .in("status", ["active", "waiting_invite", "queued", "pending"]);
      const reservedTotal = (activeTotal || []).reduce((sum, r) => sum + (r.credits_requested || 0), 0);

      remainingTotal = tokenData.total_limit - usedTotal - reservedTotal;
      if (remainingTotal <= 0) {
        return new Response(
          JSON.stringify({ valid: false, error: "Limite total de créditos atingido" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // ===== DAILY BONUS =====
    // Temporary +500 bonus valid only on 2026-02-17 (BRT)
    const BONUS_DATE_BRT = "2026-02-17";
    const BONUS_AMOUNT = 500;
    const nowForBonus = new Date();
    const brtDateStr = new Date(nowForBonus.getTime() - 3 * 3600000).toISOString().slice(0, 10);
    const dailyBonusActive = brtDateStr === BONUS_DATE_BRT;
    const dailyBonus = dailyBonusActive ? BONUS_AMOUNT : 0;
    // =========================

    // Check daily limit using generations table (has accurate credits_earned)
    let remainingDaily: number | null = null;
    if (tokenData.daily_limit) {
      // Daily boundary: 12:00 BRT = 15:00 UTC
      const now = new Date();
      const todayAt15UTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 15, 0, 0));
      const todayStart = now >= todayAt15UTC ? todayAt15UTC : new Date(todayAt15UTC.getTime() - 24 * 3600000);

      // Sum credits_earned from completed/running generations today
      const { data: earnedDaily } = await supabase
        .from("generations")
        .select("credits_earned")
        .eq("token_id", tokenData.id)
        .in("status", ["completed", "running"])
        .gte("created_at", todayStart.toISOString());
      const usedDaily = (earnedDaily || []).reduce((sum, r) => sum + (r.credits_earned || 0), 0);

      // Sum credits_requested from in-progress generations today (reserved)
      const { data: activeDaily } = await supabase
        .from("generations")
        .select("credits_requested")
        .eq("token_id", tokenData.id)
        .in("status", ["active", "waiting_invite", "queued", "pending"])
        .gte("created_at", todayStart.toISOString());
      const reservedDaily = (activeDaily || []).reduce((sum, r) => sum + (r.credits_requested || 0), 0);

      remainingDaily = (tokenData.daily_limit + dailyBonus) - usedDaily - reservedDaily;
      if (remainingDaily <= 0) {
        // Return daily_limit_reached flag instead of blocking
        return new Response(
          JSON.stringify({
            valid: true,
            daily_limit_reached: true,
            token: {
              id: tokenData.id,
              client_name: tokenData.client_name,
              credits_per_use: tokenData.credits_per_use,
              total_limit: tokenData.total_limit,
              daily_limit: tokenData.daily_limit + dailyBonus,
              expires_at: tokenData.expires_at,
              is_active: tokenData.is_active,
            },
            remaining_total: remainingTotal,
            remaining_daily: 0,
            warning_message: tokenData.warning_message || null,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Check maintenance mode (manual OR night mode)
    const maintenanceActive = new Date(MAINTENANCE_UNTIL) > new Date() && !MAINTENANCE_BYPASS_TOKENS.includes(token);
    const nightBlocked = isNightMode && !MAINTENANCE_BYPASS_TOKENS.includes(token);

    // If just validating, return token info (include maintenance/night info)
    if (action === "validate") {
      const activeBlock = maintenanceActive || nightBlocked;
      const blockMsg = maintenanceActive ? MAINTENANCE_MSG : NIGHT_MSG;
      const blockUntil = maintenanceActive ? MAINTENANCE_UNTIL : getNext7amBRT();

      return new Response(
        JSON.stringify({
          valid: true,
          token: {
            id: tokenData.id,
            client_name: tokenData.client_name,
            credits_per_use: tokenData.credits_per_use,
            total_limit: tokenData.total_limit,
            daily_limit: tokenData.daily_limit + dailyBonus,
            expires_at: tokenData.expires_at,
            is_active: tokenData.is_active,
          },
          remaining_total: remainingTotal,
          remaining_daily: remainingDaily,
          maintenance: activeBlock ? { until: blockUntil, message: blockMsg, hide_demand_info: HIDE_DEMAND_INFO_TOKENS.includes(token) } : null,
          warning_message: tokenData.warning_message || null,
          daily_bonus: dailyBonusActive ? BONUS_AMOUNT : 0,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // If creating a farm
    if (action === "create") {
      // Block creation during maintenance or night mode
      if (maintenanceActive) {
        return new Response(
          JSON.stringify({ success: false, error: MAINTENANCE_MSG }),
          { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (nightBlocked) {
        return new Response(
          JSON.stringify({ success: false, error: NIGHT_MSG }),
          { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (!farmApiKey) {
        return new Response(
          JSON.stringify({ success: false, error: "FARM_API_KEY not configured" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Auto-cancel previous sessions that haven't started running yet
      const { data: activeSessions } = await supabase
        .from("token_usages")
        .select("id, farm_id, status")
        .eq("token_id", tokenData.id)
        .in("status", ["active", "running", "pending", "waiting_invite", "queued"]);

      if (activeSessions && activeSessions.length > 0) {
        for (const s of activeSessions) {
          if (s.status === "running" && s.farm_id) {
            try {
              const statusRes = await fetch(`${API_BASE}/farm/status/${s.farm_id}`, {
                headers: { "x-api-key": farmApiKey },
              });
              if (statusRes.ok) {
                const statusData = await statusRes.json();
                if (statusData.status === "running" || statusData.status === "completed") {
                  return new Response(
                    JSON.stringify({
                      success: false,
                      error: "Você já tem uma geração em andamento. Atualize a página para retomá-la.",
                      existingFarmId: s.farm_id,
                    }),
                    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
                  );
                }
              }
            } catch {
              // API unreachable, safe to cancel stale session
            }
          }
          await supabase
            .from("token_usages")
            .update({ status: "cancelled", credits_earned: 0, completed_at: new Date().toISOString() })
            .eq("id", s.id);
          if (s.farm_id) {
            await supabase
              .from("generations")
              .update({ status: "cancelled", credits_earned: 0 })
              .eq("farm_id", s.farm_id);
          }
        }
      }

      const MAX_CREDITS_PER_GENERATION = 10000;
      const requestedCredits = Math.min(credits || tokenData.credits_per_use, tokenData.credits_per_use, MAX_CREDITS_PER_GENERATION);

      // Check active generation count (with ghost filtering) — MAX 8 concurrent
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
        // QUEUE: insert with placeholder farm_id
        const placeholderFarmId = `queued-${crypto.randomUUID()}`;

        // Reserve credits atomically
        const reserveResult = await supabase.rpc("reserve_credits", {
          p_token_id: tokenData.id,
          p_farm_id: placeholderFarmId,
          p_client_name: tokenData.client_name,
          p_credits_requested: requestedCredits,
          p_status: "queued",
          p_master_email: null,
          p_client_ip: clientIp,
          p_queued: true,
        });

        if (reserveResult.error || !reserveResult.data?.success) {
          return new Response(
            JSON.stringify({ success: false, error: reserveResult.data?.error || "Falha ao reservar créditos" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Get generation id for queue position
        const { data: queuedGen } = await supabase
          .from("generations")
          .select("id, created_at")
          .eq("farm_id", placeholderFarmId)
          .single();

        let queuePosition = 1;
        if (queuedGen) {
          const { count } = await supabase
            .from("generations")
            .select("id", { count: "exact", head: true })
            .eq("status", "queued")
            .lt("created_at", queuedGen.created_at);
          queuePosition = (count || 0) + 1;
        }

        console.log(`[validate-token] Queued: generationId=${queuedGen?.id}, position=${queuePosition}, credits=${requestedCredits}`);

        return new Response(
          JSON.stringify({
            success: true,
            queued: true,
            queuePosition,
            farmId: placeholderFarmId,
            generationId: queuedGen?.id,
            masterEmail: null,
            message: `Sua geração está na fila (posição ${queuePosition}). Aguarde...`,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // NOT QUEUED: create farm immediately
      const farmRes = await fetch(`${API_BASE}/farm/create`, {
        method: "POST",
        headers: {
          "x-api-key": farmApiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ credits: requestedCredits }),
      });

      if (!farmRes.ok) {
        const err = await farmRes.text();
        return new Response(
          JSON.stringify({ success: false, error: `Erro ao criar farm: ${err}` }),
          { status: farmRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const farmData = await farmRes.json();

      // Record usage
      await supabase.from("token_usages").insert({
        token_id: tokenData.id,
        farm_id: farmData.farmId,
        credits_requested: requestedCredits,
        status: "active",
        client_ip: clientIp,
      });

      // Record generation for live dashboard
      await supabase.from("generations").insert({
        token_id: tokenData.id,
        farm_id: farmData.farmId,
        client_name: tokenData.client_name,
        credits_requested: requestedCredits,
        status: farmData.queued ? "queued" : "waiting_invite",
        master_email: farmData.masterEmail || null,
        client_ip: clientIp,
      });

      return new Response(
        JSON.stringify({
          success: true,
          farmId: farmData.farmId,
          queued: farmData.queued,
          queuePosition: farmData.queuePosition,
          masterEmail: farmData.masterEmail,
          message: farmData.message,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }


    return new Response(
      JSON.stringify({ error: "Invalid action" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[validate-token] error:", error);
    return new Response(
      JSON.stringify({ error: "Erro interno do servidor" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
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
