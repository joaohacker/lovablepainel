import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

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
    // Require authentication
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Auth required" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Invalid user" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { order_id } = await req.json();
    if (!order_id) {
      return new Response(JSON.stringify({ error: "Missing order_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // SECURITY FIX: Atomic claim — UPDATE with WHERE user_id IS NULL
    // Only one concurrent request can succeed because the UPDATE locks the row.
    const { data: claimedOrder, error: claimError } = await supabase
      .from("orders")
      .update({ user_id: user.id })
      .eq("id", order_id)
      .eq("status", "paid")
      .eq("order_type", "deposit")
      .is("user_id", null)
      .select("id, amount")
      .maybeSingle();

    if (claimError || !claimedOrder) {
      // Check if order was already credited by webhook (user_id already set)
      const { data: existingOrder } = await supabase
        .from("orders")
        .select("id, user_id")
        .eq("id", order_id)
        .eq("status", "paid")
        .eq("user_id", user.id)
        .maybeSingle();

      if (existingOrder) {
        // Already credited by webhook — return success silently
        return new Response(JSON.stringify({ success: true, already_credited: true }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ error: "Order not found or already claimed" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Credit wallet — only runs if the atomic claim succeeded
    const { data: creditResult, error: creditError } = await supabase.rpc("credit_wallet", {
      p_user_id: user.id,
      p_amount: Number(claimedOrder.amount),
      p_description: `Depósito via PIX`,
      p_reference_id: claimedOrder.id,
    });

    if (creditError) {
      console.error("[claim-deposit] Credit error:", creditError);
      return new Response(JSON.stringify({ error: "Failed to credit wallet" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[claim-deposit] User ${user.id} claimed order ${claimedOrder.id}, R$${claimedOrder.amount} credited`);

    return new Response(JSON.stringify({
      success: true,
      amount: Number(claimedOrder.amount),
      new_balance: (creditResult as any)?.new_balance,
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[claim-deposit] Error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
