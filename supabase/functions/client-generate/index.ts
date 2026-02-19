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
  const FARM_API_KEY = Deno.env.get("FARM_API_KEY")!;

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { action, token, credits } = await req.json();

    if (!token || typeof token !== "string") {
      return new Response(
        JSON.stringify({ error: "Token obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate token
    const { data: clientToken, error: tokenError } = await supabase
      .from("client_tokens")
      .select("id, token, total_credits, credits_used, is_active, expires_at, owner_id")
      .eq("token", token)
      .maybeSingle();

    if (tokenError || !clientToken) {
      return new Response(
        JSON.stringify({ error: "Link inválido" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!clientToken.is_active) {
      return new Response(
        JSON.stringify({ error: "Link desativado" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (new Date(clientToken.expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ error: "Link expirado" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const remaining = clientToken.total_credits - clientToken.credits_used;

    // === VALIDATE ===
    if (action === "validate") {
      return new Response(
        JSON.stringify({
          success: true,
          total_credits: clientToken.total_credits,
          credits_used: clientToken.credits_used,
          remaining,
          expires_at: clientToken.expires_at,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // === CREATE ===
    if (action === "create") {
      if (!credits || typeof credits !== "number" || credits < 5 || credits % 5 !== 0) {
        return new Response(
          JSON.stringify({ error: "Créditos inválidos" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (remaining <= 0) {
        return new Response(
          JSON.stringify({ error: "Créditos esgotados" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Clamp to remaining
      const actualCredits = Math.min(credits, remaining);

      // Atomic debit from client token
      const { data: useResult, error: useError } = await supabase.rpc("use_client_token_credits", {
        p_token_id: clientToken.id,
        p_credits: actualCredits,
      });

      if (useError) throw new Error(useError.message);
      if (!useResult?.success) {
        return new Response(
          JSON.stringify({ error: useResult?.error || "Falha ao reservar créditos" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Create farm
      const slavesCount = Math.ceil(actualCredits / 5);
      let farmData: any;
      try {
        const farmRes = await fetch(`${API_BASE}/farm/create`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-api-key": FARM_API_KEY },
          body: JSON.stringify({ credits: actualCredits, slavesCount }),
        });

        if (!farmRes.ok) {
          const errBody = await farmRes.text();
          throw new Error(errBody || "Farm API error");
        }

        farmData = await farmRes.json();
      } catch (farmErr) {
        // Refund on failure: reverse the credits_used
        await supabase
          .from("client_tokens")
          .update({ credits_used: clientToken.credits_used })
          .eq("id", clientToken.id);

        throw farmErr;
      }

      console.log(`[client-generate] Farm created: ${farmData.farmId} for client token ${clientToken.id}, ${actualCredits} credits`);

      return new Response(
        JSON.stringify({
          success: true,
          farmId: farmData.farmId,
          masterEmail: farmData.masterEmail,
          credits: actualCredits,
          queued: farmData.queued || false,
          queuePosition: farmData.queuePosition,
          remaining: useResult.remaining,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Ação inválida. Use: validate, create" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[client-generate] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
