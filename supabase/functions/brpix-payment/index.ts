import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BRPIX_BASE = "https://finance.brpixpayments.com/api";

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
    const { product_id, email, source } = await req.json();

    if (!product_id) {
      return new Response(
        JSON.stringify({ error: "Missing required field: product_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const customer = { name: "Cliente Lovable", email: email || "cliente@lovable.com", document: "12345678909" };

    // Fetch product
    const { data: product, error: productError } = await supabase
      .from("products")
      .select("*")
      .eq("id", product_id)
      .eq("is_active", true)
      .single();

    if (productError || !product) {
      return new Response(
        JSON.stringify({ error: "Produto não encontrado ou inativo" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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
        amount: Number(product.price),
        payment_method: "pix",
        customer: {
          name: customer.name,
          email: customer.email,
          document: customer.document.replace(/\D/g, ""),
        },
        external_id: `order_${Date.now()}`,
      }),
    });

    const pixData = await pixRes.json();
    console.log("[brpix-payment] BrPix response:", JSON.stringify(pixData));

    if (!pixData.success && !pixData.transaction_id) {
      return new Response(
        JSON.stringify({ error: pixData.error || "Erro ao criar pagamento PIX" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Save order in DB
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert({
        product_id: product.id,
        amount: Number(product.price),
        customer_name: customer.name,
        customer_email: customer.email,
        customer_document: customer.document.replace(/\D/g, ""),
        transaction_id: pixData.transaction_id,
        pix_code: pixData.pix?.qr_code || null,
        pix_expires_at: pixData.expires_at || null,
        status: "pending",
      })
      .select()
      .single();

    if (orderError) {
      console.error("[brpix-payment] Order insert error:", orderError);
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
        amount: Number(product.price),
        expires_at: pixData.pix?.expiration_date || pixData.expires_at || null,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[brpix-payment] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
