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
    return new Response(JSON.stringify({ error: "BRPIX_API_KEY not configured" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Authenticate user
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

    const { amount } = await req.json();

    if (!amount || amount < 1) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const customer = { name: "Cliente Lovable", document: "12345678909" };

    // Create PIX payment via BrPix
    const pixRes = await fetch(`${BRPIX_BASE}/payments`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${BRPIX_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: Number(amount),
        payment_method: "pix",
        customer: {
          name: customer.name,
          email: user.email,
          document: customer.document.replace(/\D/g, ""),
        },
        external_id: `wallet_${user.id}_${Date.now()}`,
      }),
    });

    const pixData = await pixRes.json();
    console.log("[wallet-deposit] BrPix response:", JSON.stringify(pixData));

    if (!pixData.success && !pixData.transaction_id) {
      return new Response(JSON.stringify({ error: pixData.error || "Erro ao criar PIX" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // We need a product_id for the orders table FK. Find or use a dummy.
    // Use the first active product as reference
    const { data: product } = await supabase
      .from("products")
      .select("id")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    if (!product) {
      return new Response(JSON.stringify({ error: "No active product found" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Save order with order_type = 'deposit'
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert({
        product_id: product.id,
        amount: Number(amount),
        customer_name: customer.name,
        customer_email: user.email || "",
        customer_document: customer.document.replace(/\D/g, ""),
        transaction_id: pixData.transaction_id,
        pix_code: pixData.pix?.qr_code || null,
        pix_expires_at: pixData.expires_at || null,
        status: "pending",
        user_id: user.id,
        order_type: "deposit",
      })
      .select()
      .single();

    if (orderError) {
      console.error("[wallet-deposit] Order insert error:", orderError);
      return new Response(JSON.stringify({ error: "Erro ao salvar pedido" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      order_id: order.id,
      transaction_id: pixData.transaction_id,
      pix_code: pixData.pix?.qr_code || null,
      amount: Number(amount),
      expires_at: pixData.pix?.expiration_date || pixData.expires_at || null,
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[wallet-deposit] Error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
