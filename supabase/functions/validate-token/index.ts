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
      // Daily reset at noon BRT (15:00 UTC)
      const now = new Date();
      const todayStart = new Date();
      todayStart.setUTCHours(15, 0, 0, 0);
      // If we haven't reached 15:00 UTC yet today, use yesterday's 15:00 UTC
      if (now < todayStart) {
        todayStart.setUTCDate(todayStart.getUTCDate() - 1);
      }

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

    // If just validating, return token info
    if (action === "validate") {
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
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // If creating a farm
    if (action === "create") {
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
        .in("status", ["active", "running", "pending"]);

      if (activeSessions && activeSessions.length > 0) {
        for (const s of activeSessions) {
          if (s.status === "running" && s.farm_id) {
            // Check real status from external API before cancelling
            try {
              const statusRes = await fetch(`${API_BASE}/farm/${s.farm_id}/status`, {
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
      });

      // Record generation for live dashboard
      await supabase.from("generations").insert({
        token_id: tokenData.id,
        farm_id: farmData.farmId,
        client_name: tokenData.client_name,
        credits_requested: requestedCredits,
        status: farmData.queued ? "queued" : "waiting_invite",
        master_email: farmData.masterEmail || null,
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

    // Update generation status
    if (action === "update-status") {
      const farmId = bodyFarmId;
      const status = bodyStatus;

      if (!farmId) {
        return new Response(
          JSON.stringify({ success: false, error: "farmId required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Verify this farm belongs to this token
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

      // Also update token_usages table
      const usageUpdate: Record<string, unknown> = { status: status || "active" };
      // Only save credits_earned on completed; force 0 on error/cancelled/expired
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
