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
    const { action, token, credits, farmId, creditsEarned, status } = await req.json();

    if (!token || typeof token !== "string") {
      return new Response(
        JSON.stringify({ error: "Token obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate token
    const { data: clientToken, error: tokenError } = await supabase
      .from("client_tokens")
      .select("id, token, total_credits, credits_used, is_active, owner_id")
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

    const remaining = clientToken.total_credits - clientToken.credits_used;

    // === VALIDATE ===
    if (action === "validate") {
      return new Response(
        JSON.stringify({
          success: true,
          total_credits: clientToken.total_credits,
          credits_used: clientToken.credits_used,
          remaining,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // === UPDATE STATUS (push from frontend) ===
    if (action === "update-status") {
      if (!farmId) {
        return new Response(
          JSON.stringify({ error: "farmId obrigatório" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const updateData: Record<string, any> = {};
      if (status) updateData.status = status;
      if (typeof creditsEarned === "number") updateData.credits_earned = creditsEarned;
      updateData.updated_at = new Date().toISOString();

      if (Object.keys(updateData).length > 1) {
        await supabase
          .from("generations")
          .update(updateData)
          .eq("farm_id", farmId)
          .eq("client_token_id", clientToken.id);
      }

      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // === REFUND EXPIRED/CANCELLED (from frontend terminal states) ===
    if (action === "refund-expired") {
      if (!farmId) {
        return new Response(
          JSON.stringify({ error: "farmId obrigatório" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Find the generation
      const { data: gen } = await supabase
        .from("generations")
        .select("id, credits_requested, credits_earned, status, settled_at, client_token_id")
        .eq("farm_id", farmId)
        .eq("client_token_id", clientToken.id)
        .maybeSingle();

      if (!gen || gen.settled_at) {
        return new Response(
          JSON.stringify({ success: true, already_settled: true }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const earned = gen.credits_earned ?? 0;
      const requested = gen.credits_requested;
      const refundCredits = requested - earned;

      // Mark as settled
      const { data: updated } = await supabase
        .from("generations")
        .update({
          status: status || "expired",
          settled_at: new Date().toISOString(),
          credits_earned: earned,
        })
        .eq("id", gen.id)
        .is("settled_at", null)
        .select("id")
        .maybeSingle();

      if (!updated) {
        return new Response(
          JSON.stringify({ success: true, already_settled: true }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Refund unused credits back to client_token
      if (refundCredits > 0) {
        const { data: refundResult, error: refundError } = await supabase.rpc("refund_client_token_credits", {
          p_token_id: clientToken.id,
          p_credits: refundCredits,
        });

        if (refundError) {
          console.error(`[client-generate] Refund failed:`, refundError);
          // Rollback settlement
          await supabase.from("generations").update({ settled_at: null, status: gen.status }).eq("id", gen.id);
          throw new Error("Falha ao reembolsar créditos");
        }

        console.log(`[client-generate] Refunded ${refundCredits} credits to token ${clientToken.id} (${earned}/${requested} delivered)`);
      }

      // Also settle completed with full delivery
      if (earned >= requested && refundCredits <= 0) {
        console.log(`[client-generate] Settled completed generation, all ${requested} credits delivered`);
      }

      // Requery remaining
      const { data: updatedToken } = await supabase
        .from("client_tokens")
        .select("credits_used, total_credits")
        .eq("id", clientToken.id)
        .single();

      return new Response(
        JSON.stringify({
          success: true,
          refunded: refundCredits,
          remaining: updatedToken ? updatedToken.total_credits - updatedToken.credits_used : remaining,
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
        // Refund on failure
        await supabase.rpc("refund_client_token_credits", {
          p_token_id: clientToken.id,
          p_credits: actualCredits,
        });
        throw farmErr;
      }

      // Insert generation record linked to client_token
      await supabase.from("generations").insert({
        farm_id: farmData.farmId,
        client_name: `client-link-${clientToken.id.slice(0, 8)}`,
        credits_requested: actualCredits,
        status: farmData.queued ? "queued" : "waiting_invite",
        master_email: farmData.masterEmail,
        client_token_id: clientToken.id,
      });

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
      JSON.stringify({ error: "Ação inválida. Use: validate, create, update-status, refund-expired" }),
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
