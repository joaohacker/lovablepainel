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
    const MAINTENANCE_UNTIL = "2000-01-01T00:00:00Z"; // Manutenção DESATIVADA
    const MAINTENANCE_MSG = "🔧 Atualizando painel com melhorias. Aguarde alguns minutos!";
    // Tokens allowed to bypass maintenance (for testing)
    const MAINTENANCE_BYPASS_TOKENS: string[] = ["03f78b41e125c61f9443014c12a76b77"];
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
        const realCredits = real.creditsEarned ?? real.result?.credits ?? 0;
        const realStatus = real.status === "completed" ? "completed" : real.status === "error" ? "error" : real.status;

        await supabase.from("generations").update({
          status: realStatus,
          credits_earned: realCredits,
          master_email: real.masterEmail || undefined,
          workspace_name: real.workspaceName || undefined,
        }).eq("farm_id", farmId);

        await supabase.from("token_usages").update({
          status: realStatus,
          credits_earned: realCredits,
          completed_at: ["completed", "error", "expired", "cancelled"].includes(realStatus) ? new Date().toISOString() : undefined,
        }).eq("farm_id", farmId);

        return new Response(JSON.stringify({ success: true, status: realStatus, credits_earned: realCredits }),
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

      const { data: gen } = await supabase
        .from("generations")
        .select("id")
        .eq("farm_id", farmId)
        .eq("token_id", tokenData.id)
        .maybeSingle();

      if (!gen) {
        return new Response(
          JSON.stringify({ success: false, error: "Generation not found for this token" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const updateData: Record<string, unknown> = { status };
      if (credits_earned !== undefined) updateData.credits_earned = credits_earned;
      if (master_email !== undefined) updateData.master_email = master_email;
      if (workspace_name !== undefined) updateData.workspace_name = workspace_name;
      if (error_message !== undefined) updateData.error_message = error_message;

      await supabase
        .from("generations")
        .update(updateData)
        .eq("farm_id", farmId);

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

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if active
    if (!tokenData.is_active) {
      return new Response(
        JSON.stringify({ valid: false, error: "Este token foi desativado" }),
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

      remainingDaily = tokenData.daily_limit - usedDaily - reservedDaily;
      if (remainingDaily <= 0) {
        return new Response(
          JSON.stringify({ valid: false, error: "Limite diário de créditos atingido" }),
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
            daily_limit: tokenData.daily_limit,
            expires_at: tokenData.expires_at,
            is_active: tokenData.is_active,
          },
          remaining_total: remainingTotal,
          remaining_daily: remainingDaily,
          maintenance: activeBlock ? { until: blockUntil, message: blockMsg } : null,
          warning_message: tokenData.warning_message || null,
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

      const requestedCredits = Math.min(credits || tokenData.credits_per_use, tokenData.credits_per_use);

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
