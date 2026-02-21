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
    // SECURITY: Require authentication for deposits
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Autenticação necessária para depósitos" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Usuário inválido" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = user.id;

    // Check if user is banned
    const { data: isBanned } = await supabase.rpc("is_user_banned", { p_user_id: userId });
    if (isBanned) {
      return new Response(JSON.stringify({ error: "⛔ Conta suspensa por violação dos termos de uso." }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if IP is banned
    const clientIpCheck = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const { data: isIpBanned } = await supabase.rpc("is_ip_banned", { p_ip: clientIpCheck });
    if (isIpBanned) {
      return new Response(JSON.stringify({ error: "⛔ Acesso bloqueado." }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // SECURITY: Rate limiting — 10 deposits per 5 minutes
    const { data: rateCheck } = await supabase.rpc("check_rate_limit", {
      p_user_id: userId,
      p_ip: clientIpCheck,
      p_endpoint: "wallet-deposit",
      p_max_requests: 10,
      p_window_seconds: 300,
    });
    if (rateCheck && !rateCheck.allowed) {
      return new Response(JSON.stringify({ error: "Muitas tentativas. Aguarde alguns minutos." }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { amount, coupon_code } = await req.json();

    if (!amount || amount < 5) {
      return new Response(JSON.stringify({ error: "Valor mínimo é R$ 5,00" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (amount > 10000) {
      return new Response(JSON.stringify({ error: "Valor máximo é R$ 10.000,00" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate coupon if provided
    let discountAmount = 0;
    let couponId: string | null = null;
    if (coupon_code && typeof coupon_code === "string" && coupon_code.trim()) {
      const code = coupon_code.trim().toUpperCase();
      const { data: coupon } = await supabase
        .from("coupons")
        .select("*")
        .eq("code", code)
        .eq("is_active", true)
        .maybeSingle();

      if (!coupon) {
        return new Response(JSON.stringify({ error: "Cupom inválido ou expirado" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
        return new Response(JSON.stringify({ error: "Cupom expirado" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (coupon.max_uses !== null && coupon.times_used >= coupon.max_uses) {
        return new Response(JSON.stringify({ error: "Cupom esgotado" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (coupon.discount_type === "percentage") {
        discountAmount = +(amount * (coupon.discount_value / 100)).toFixed(2);
      } else {
        discountAmount = +Math.min(coupon.discount_value, amount).toFixed(2);
      }

      // Ensure final amount is at least R$5 (BrPix minimum)
      const tentativeFinal = +(amount - discountAmount).toFixed(2);
      if (tentativeFinal < 5) {
        return new Response(JSON.stringify({ 
          error: `Com esse cupom o valor mínimo do depósito é ${(5 + discountAmount).toFixed(2).replace('.', ',')}. O PIX exige no mínimo R$ 5,00.` 
        }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      couponId = coupon.id;

      // DON'T increment usage here — only increment after PIX is confirmed
      // This prevents users from "burning" coupons without paying
    }

    const finalAmount = +(amount - discountAmount).toFixed(2);

    const customer = { name: "Cliente Lovable", document: "12345678909" };

    // Create PIX payment via BrPix
    const pixRes = await fetch(`${BRPIX_BASE}/payments`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${BRPIX_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: finalAmount,
        payment_method: "pix",
        customer: {
          name: customer.name,
          email: "cliente@lovable.com",
          document: customer.document,
        },
        external_id: `wallet_${userId || "anon"}_${Date.now()}`,
      }),
    });

    const pixData = await pixRes.json();
    console.log("[wallet-deposit] BrPix response:", JSON.stringify(pixData));

    if (!pixData.success && !pixData.transaction_id) {
      return new Response(JSON.stringify({ error: pixData.error || "Erro ao criar PIX" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // We need a product_id for the orders table FK
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

    // Save order — user_id can be null for anonymous deposits
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert({
        product_id: product.id,
        amount: Number(amount), // Store original amount for wallet credit
        customer_name: customer.name,
        customer_email: "cliente@lovable.com",
        customer_document: customer.document,
        transaction_id: pixData.transaction_id,
        pix_code: pixData.pix?.qr_code || null,
        pix_expires_at: pixData.expires_at || null,
        status: "pending",
        user_id: userId,
        order_type: "deposit",
        coupon_id: couponId,
        discount_amount: discountAmount,
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
      final_amount: finalAmount,
      discount: discountAmount,
      expires_at: pixData.pix?.expiration_date || pixData.expires_at || null,
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[wallet-deposit] Error:", error);
    return new Response(JSON.stringify({ error: "Erro interno do servidor" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});