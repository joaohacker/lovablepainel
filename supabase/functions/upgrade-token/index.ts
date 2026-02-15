import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BRPIX_BASE = "https://finance.brpixpayments.com/api";

// Daily: tiered pricing per 1000
function getDailyAmount(increment: number, currentDailyLimit: number): number {
  const newLimit = (currentDailyLimit || 0) + increment;
  const pricePerK = newLimit >= 10000 ? 15 : newLimit >= 5000 ? 10 : 8;
  return (increment / 1000) * pricePerK;
}

// Per-use: tiered pricing based on new target
function getPerUseAmount(increment: number, currentCreditsPerUse: number): number {
  const target = currentCreditsPerUse + increment;
  const originalPrice = (increment / 1000) * 30;
  if (target >= 10000) return Math.min(180, originalPrice);
  let discountPct = 0;
  if (target >= 9000) discountPct = 20;
  else if (target >= 7000) discountPct = 15;
  else if (target >= 5000) discountPct = 10;
  else if (target >= 3000) discountPct = 5;
  return originalPrice * (1 - discountPct / 100);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const BRPIX_API_KEY = Deno.env.get("BRPIX_API_KEY");
  if (!BRPIX_API_KEY) {
    return new Response(
      JSON.stringify({ error: "BRPIX_API_KEY not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { token, upgrade_type, increment } = await req.json();

    if (!token || !upgrade_type || !increment) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: token, upgrade_type, increment" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!["daily_limit", "credits_per_use"].includes(upgrade_type)) {
      return new Response(
        JSON.stringify({ error: "upgrade_type must be 'daily_limit' or 'credits_per_use'" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (increment < 1000 || increment % 1000 !== 0) {
      return new Response(
        JSON.stringify({ error: "increment must be a multiple of 1000" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate token
    const { data: tokenData, error: tokenError } = await supabase
      .from("tokens")
      .select("*")
      .eq("token", token)
      .single();

    if (tokenError || !tokenData) {
      return new Response(
        JSON.stringify({ error: "Token inválido" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Calculate price
    let amount: number;
    if (upgrade_type === "daily_limit") {
      amount = getDailyAmount(increment, tokenData.daily_limit);
    } else {
      amount = getPerUseAmount(increment, tokenData.credits_per_use);
    }
    const orderType = upgrade_type === "daily_limit" ? "upgrade_daily" : "upgrade_per_use";

    // We need a product_id for the orders table FK. Use a dummy/first product.
    const { data: product } = await supabase
      .from("products")
      .select("id")
      .limit(1)
      .single();

    if (!product) {
      return new Response(
        JSON.stringify({ error: "No product found for order reference" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create PIX payment via BrPix
    const pixRes = await fetch(`${BRPIX_BASE}/payments`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${BRPIX_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount,
        payment_method: "pix",
        customer: {
          name: tokenData.client_name,
          email: "upgrade@lovable.com",
          document: "12345678909",
        },
        external_id: `upgrade_${Date.now()}`,
      }),
    });

    const pixData = await pixRes.json();
    console.log("[upgrade-token] BrPix response:", JSON.stringify(pixData));

    if (!pixData.success && !pixData.transaction_id) {
      return new Response(
        JSON.stringify({ error: pixData.error || "Erro ao criar pagamento PIX" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Save order
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert({
        product_id: product.id,
        amount,
        customer_name: tokenData.client_name,
        customer_email: "upgrade@lovable.com",
        customer_document: "12345678909",
        transaction_id: pixData.transaction_id,
        pix_code: pixData.pix?.qr_code || null,
        pix_expires_at: pixData.expires_at || null,
        status: "pending",
        order_type: orderType,
        token_id: tokenData.id,
        upgrade_increment: increment,
      })
      .select()
      .single();

    if (orderError) {
      console.error("[upgrade-token] Order insert error:", orderError);
      return new Response(
        JSON.stringify({ error: "Erro ao salvar pedido" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        order_id: order.id,
        transaction_id: pixData.transaction_id,
        pix_code: pixData.pix?.qr_code || null,
        amount,
        expires_at: pixData.pix?.expiration_date || pixData.expires_at || null,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[upgrade-token] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
