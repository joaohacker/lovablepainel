import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://painelcreditoslovbl.lovable.app",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Authenticate user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autenticado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser();

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Não autenticado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { action, tokenId, search, filter } = await req.json();

    // ACTION: list
    if (action === "list") {
      let query = supabase
        .from("client_tokens")
        .select("*")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);

      if (search) {
        query = query.ilike("token", `%${search}%`);
      }

      if (filter === "active") {
        query = query.eq("is_active", true).gt("total_credits", 0);
      } else if (filter === "exhausted") {
        query = query.eq("is_active", true);
      } else if (filter === "disabled") {
        query = query.eq("is_active", false);
      }

      const { data: tokens, error } = await query;
      if (error) throw error;

      // For "exhausted" filter, post-filter where credits_used >= total_credits
      let filtered = tokens || [];
      if (filter === "exhausted") {
        filtered = filtered.filter((t: any) => t.credits_used >= t.total_credits);
      } else if (filter === "active") {
        filtered = filtered.filter((t: any) => t.credits_used < t.total_credits);
      }

      return new Response(JSON.stringify({ success: true, tokens: filtered }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ACTION: details
    if (action === "details") {
      if (!tokenId) {
        return new Response(JSON.stringify({ error: "tokenId obrigatório" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Verify ownership
      const { data: tok, error: tokErr } = await supabase
        .from("client_tokens")
        .select("*")
        .eq("id", tokenId)
        .eq("owner_id", user.id)
        .single();

      if (tokErr || !tok) {
        return new Response(JSON.stringify({ error: "Token não encontrado" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Fetch generations linked to this client token
      const { data: generations, error: genErr } = await supabase
        .from("generations")
        .select(
          "id, status, credits_requested, credits_earned, workspace_name, master_email, created_at, updated_at, farm_id, error_message"
        )
        .eq("client_token_id", tokenId)
        .order("created_at", { ascending: false })
        .limit(50);

      if (genErr) throw genErr;

      return new Response(
        JSON.stringify({ success: true, token: tok, generations: generations || [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ACTION: deactivate
    if (action === "deactivate") {
      if (!tokenId) {
        return new Response(JSON.stringify({ error: "tokenId obrigatório" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Verify ownership — fetch full token data
      const { data: tok, error: tokErr } = await supabase
        .from("client_tokens")
        .select("*")
        .eq("id", tokenId)
        .eq("owner_id", user.id)
        .single();

      if (tokErr || !tok) {
        return new Response(JSON.stringify({ error: "Token não encontrado" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // SECURITY: Block if already deactivated (prevents double-refund)
      if (!tok.is_active) {
        return new Response(
          JSON.stringify({ error: "Link já está desativado" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check if any generations have actually delivered credits
      const { data: gens } = await supabase
        .from("generations")
        .select("id, credits_earned, status")
        .eq("client_token_id", tokenId);

      const hasUsedCredits = (gens || []).some(
        (g: any) =>
          (g.credits_earned && g.credits_earned > 0) ||
          ["running", "waiting_invite", "queued", "creating"].includes(g.status)
      );

      // Atomic deactivate: only update if still active (race condition guard)
      const { data: updated, error: updateErr } = await supabase
        .from("client_tokens")
        .update({ is_active: false })
        .eq("id", tokenId)
        .eq("is_active", true)
        .select("id")
        .single();

      if (updateErr || !updated) {
        return new Response(
          JSON.stringify({ error: "Link já foi desativado" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Refund if no credits were used
      let refunded = false;
      let refundAmount = 0;

      if (!hasUsedCredits && tok.total_credits > 0) {
        // Calculate refund using the same pricing function
        const { data: priceData } = await supabase.rpc("calc_credit_price", {
          creditos: tok.total_credits,
        });

        refundAmount = priceData ?? 0;

        if (refundAmount > 0) {
          await supabase.rpc("credit_wallet", {
            p_user_id: user.id,
            p_amount: refundAmount,
            p_description: `Reembolso - link desativado (${tok.total_credits} créditos)`,
            p_reference_id: `client_token_refund_${tokenId}`,
          });
          refunded = true;
        }
      }

      return new Response(
        JSON.stringify({ success: true, refunded, refund_amount: refundAmount }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ error: "Ação inválida" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
