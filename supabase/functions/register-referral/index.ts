import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Get the authenticated user
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autenticado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Não autenticado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { referrer_id: rawRef } = await req.json();

    if (!rawRef || typeof rawRef !== "string") {
      return new Response(JSON.stringify({ error: "ID de indicação inválido" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve: accept both UUID and short referral_code
    let referrer_id = rawRef;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(rawRef)) {
      // Treat as referral_code, resolve to user_id
      const { data: profile } = await supabase
        .from("profiles")
        .select("user_id")
        .eq("referral_code", rawRef.toUpperCase())
        .maybeSingle();
      if (!profile) {
        return new Response(JSON.stringify({ error: "Código de indicação inválido" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      referrer_id = profile.user_id;
    }

    // Anti-exploit: no self-referral
    if (referrer_id === user.id) {
      return new Response(JSON.stringify({ error: "Não pode se auto-indicar" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if referred user already has a referral (already been referred)
    const { data: existing } = await supabase
      .from("referrals")
      .select("id")
      .eq("referred_id", user.id)
      .maybeSingle();

    if (existing) {
      // Already has a referrer, silently ignore
      return new Response(JSON.stringify({ ok: true, already_linked: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Anti-exploit: only allow referral if user has NEVER deposited
    const { data: wallet } = await supabase
      .from("wallets")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (wallet) {
      // Has wallet = has deposited before, don't allow referral link retroactively
      const { count } = await supabase
        .from("wallet_transactions")
        .select("id", { count: "exact", head: true })
        .eq("wallet_id", wallet.id)
        .eq("type", "deposit");

      if (count && count > 0) {
        return new Response(JSON.stringify({ error: "Usuário já depositou antes" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Verify referrer exists
    const { data: referrerProfile } = await supabase
      .from("profiles")
      .select("id")
      .eq("user_id", referrer_id)
      .maybeSingle();

    if (!referrerProfile) {
      return new Response(JSON.stringify({ error: "Referenciador não encontrado" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create referral link
    const { error: insertError } = await supabase
      .from("referrals")
      .insert({ referrer_id, referred_id: user.id });

    if (insertError) {
      console.error("[register-referral] Insert error:", insertError);
      // Unique constraint violation = already linked
      if (insertError.code === "23505") {
        return new Response(JSON.stringify({ ok: true, already_linked: true }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw insertError;
    }

    console.log(`[register-referral] Referral created: ${referrer_id} → ${user.id}`);

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[register-referral] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
