import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const API_BASE = "https://api.lovablextensao.shop";

serve(async (req) => {
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
    // Tokens allowed to bypass maintenance (for testing)
    const MAINTENANCE_BYPASS_TOKENS: string[] = ["f35112c962407939853dc9db8de84013"];
    // Tokens that should NOT show "painel por demanda" info in maintenance banner
    const HIDE_DEMAND_INFO_TOKENS: string[] = [
      "98a1475498ba92e7c793344107724ff0",
      "766d4a700eacb309c910c49ef2d83578",
      "90de293513871b0f3d08e37f9d92e319",
      "b94c20155a0c901fa97b933170cc8e6a",
      "afdbb6cf98ea8deaa061973b6b8635d3",
      "a89687d9613d9d6c1618173d24eb16db",
      "b23ef4b1cdcf30174239cf2b3797119c",
      "da09135be5f0bf05f81061e464823292",
      "da9d15e0f9872633b7d282c16aed8796",
      "9f0e233043e9cdf1ac6a3c872e34e7aa",
      "679116352361fe8442f76f2dc32c6408",
      "97c1bcfce9def3df3221bcbd832e7ce0",
      "f6585ba8d34adb1979be0f5a8daaeb68",
      "d92549d1a974eec03558fcf24366c6fa",
      "64ef08ce5ca30a10aa12d91944d02274",
      "1aa9c3cf7f720161df8e2e6c59289a82",
      "c0046c7b89589c2b39d8fecf3bc749e1",
    ];
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

    const body = await req.json();
    const { token, action, credits, farmId: bodyFarmId, status: bodyStatus, credits_earned, master_email, workspace_name, error_message } = body;

    if (!token) {
      return new Response(
        JSON.stringify({ valid: false, error: "Token não fornecido" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Handle __public__ token for on-demand update-status action
    if (token === "__public__" && action === "update-status") {
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
        .select("id")
        .eq("farm_id", farmId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (!gen) {
        return new Response(
          JSON.stringify({ success: false, error: "Generation not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const updateData: Record<string, unknown> = { status };
      if (master_email !== undefined) updateData.master_email = master_email;
      if (workspace_name !== undefined) updateData.workspace_name = workspace_name;
      if (error_message !== undefined) updateData.error_message = error_message;

      // Never overwrite credits_earned with a lower value, cap at credits_requested
      if (credits_earned !== undefined && credits_earned > 0) {
        const { data: currentGen } = await supabase.from("generations").select("credits_earned, credits_requested").eq("farm_id", farmId).eq("user_id", user.id).maybeSingle();
        const dbCredits = currentGen?.credits_earned ?? 0;
        const capCredits = currentGen?.credits_requested ?? Infinity;
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
        // Authenticate the user to match generation by user_id
        const authHeader = req.headers.get("authorization");
        if (authHeader) {
          const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
          const userClient = createClient(supabaseUrl, anonKey, {
            global: { headers: { Authorization: authHeader } },
          });
          const { data: { user } } = await userClient.auth.getUser();
          if (user) {
            const { data: gen } = await supabase
              .from("generations")
              .select("id")
              .eq("farm_id", farmId)
              .eq("user_id", user.id)
              .maybeSingle();
            genFound = !!gen;
          }
        }
        if (!genFound) {
          // Fallback: match by farm_id only for on-demand (token_id is null)
          const { data: gen } = await supabase
            .from("generations")
            .select("id")
            .eq("farm_id", farmId)
            .is("token_id", null)
            .maybeSingle();
          genFound = !!gen;
        }
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

      const updateData: Record<string, unknown> = { status };
      if (master_email !== undefined) updateData.master_email = master_email;
      if (workspace_name !== undefined) updateData.workspace_name = workspace_name;
      if (error_message !== undefined) updateData.error_message = error_message;

      // Never overwrite credits_earned with a lower value, cap at credits_requested
      if (credits_earned !== undefined && credits_earned > 0) {
        const { data: currentGen } = await supabase.from("generations").select("credits_earned, credits_requested").eq("farm_id", farmId).maybeSingle();
        const dbCredits = currentGen?.credits_earned ?? 0;
        const capCredits = currentGen?.credits_requested ?? Infinity;
        updateData.credits_earned = Math.min(Math.max(credits_earned, dbCredits), capCredits);
      }

      await supabase
        .from("generations")
        .update(updateData)
        .eq("farm_id", farmId);

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
      // Sessions in "running" state may have earned credits, so check the real API first
      const { data: activeSessions } = await supabase
        .from("token_usages")
        .select("id, farm_id, status")
        .eq("token_id", tokenData.id)
        .in("status", ["active", "running", "pending", "waiting_invite", "queued"]);

      if (activeSessions && activeSessions.length > 0) {
        for (const s of activeSessions) {
          if (s.status === "running" && s.farm_id) {
            // Check real status from external API before cancelling
            try {
              const statusRes = await fetch(`${API_BASE}/farm/status/${s.farm_id}`, {
                headers: { "x-api-key": farmApiKey },
              });
              if (statusRes.ok) {
                const statusData = await statusRes.json();
                if (statusData.status === "running" || statusData.status === "completed") {
                  // Session is still alive or finished — don't cancel, block new creation
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
          // Cancel sessions that are pre-execution or confirmed dead
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

      // Create farm via external API
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
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
