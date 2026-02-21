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

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const { code, amount } = await req.json();

    if (!code || typeof code !== "string" || !code.trim()) {
      return new Response(JSON.stringify({ valid: false, error: "Código inválido" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!amount || amount < 5) {
      return new Response(JSON.stringify({ valid: false, error: "Valor mínimo é R$ 5,00" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: coupon } = await supabase
      .from("coupons")
      .select("*")
      .eq("code", code.trim().toUpperCase())
      .eq("is_active", true)
      .maybeSingle();

    if (!coupon) {
      return new Response(JSON.stringify({ valid: false, error: "Cupom inválido ou já foi desativado. Promoção encerrada!" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
      return new Response(JSON.stringify({ valid: false, error: "Cupom expirado" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (coupon.max_uses !== null && coupon.times_used >= coupon.max_uses) {
      return new Response(JSON.stringify({ valid: false, error: "Cupom esgotado" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let discount = 0;
    if (coupon.discount_type === "percentage") {
      discount = +(amount * (coupon.discount_value / 100)).toFixed(2);
    } else {
      discount = +Math.min(coupon.discount_value, amount).toFixed(2);
    }

    const finalAmount = +(amount - discount).toFixed(2);
    if (finalAmount < 5) {
      return new Response(JSON.stringify({ 
        valid: false, 
        error: `Valor mínimo com esse cupom é R$ ${(5 + discount).toFixed(2).replace('.', ',')}` 
      }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      valid: true,
      discount,
      final_amount: finalAmount,
      discount_type: coupon.discount_type,
      discount_value: coupon.discount_value,
      description: coupon.discount_type === "percentage" 
        ? `${coupon.discount_value}% de desconto` 
        : `R$ ${Number(coupon.discount_value).toFixed(2).replace('.', ',')} de desconto`,
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ valid: false, error: "Erro ao validar cupom" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
