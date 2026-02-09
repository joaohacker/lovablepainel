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
    const { token, action, credits } = await req.json();

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

    // Check total limit
    let remainingTotal: number | null = null;
    if (tokenData.total_limit) {
      const { count } = await supabase
        .from("token_usages")
        .select("*", { count: "exact", head: true })
        .eq("token_id", tokenData.id);
      
      remainingTotal = tokenData.total_limit - (count || 0);
      if (remainingTotal <= 0) {
        return new Response(
          JSON.stringify({ valid: false, error: "Limite total de usos atingido" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Check daily limit
    let remainingDaily: number | null = null;
    if (tokenData.daily_limit) {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      
      const { count } = await supabase
        .from("token_usages")
        .select("*", { count: "exact", head: true })
        .eq("token_id", tokenData.id)
        .gte("created_at", todayStart.toISOString());
      
      remainingDaily = tokenData.daily_limit - (count || 0);
      if (remainingDaily <= 0) {
        return new Response(
          JSON.stringify({ valid: false, error: "Limite diário de usos atingido" }),
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
