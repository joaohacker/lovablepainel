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

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // SECURITY: Require authentication
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
    if (!order_id || typeof order_id !== "string" || order_id.length > 50) {
      return new Response(JSON.stringify({ error: "Missing order_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // SECURITY: Rate limiting — 30 requests per 60 seconds
    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const { data: rateCheck } = await supabase.rpc("check_rate_limit", {
      p_user_id: user.id,
      p_ip: clientIp,
      p_endpoint: "check-order-status",
      p_max_requests: 30,
      p_window_seconds: 60,
    });
    if (rateCheck && !rateCheck.allowed) {
      return new Response(JSON.stringify({ error: "Muitas requisições. Aguarde." }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get order from DB — SECURITY: must belong to the authenticated user
    const { data: order, error } = await supabase
      .from("orders")
      .select("status, transaction_id, amount, user_id, order_type, coupon_id")
      .eq("id", order_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (error || !order) {
      return new Response(JSON.stringify({ status: "not_found" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // If already paid, return immediately
    if (order.status !== "pending") {
      return new Response(JSON.stringify({ status: order.status }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // === ACTIVE VERIFICATION: Check BrPix API directly ===
    if (!order.transaction_id) {
      return new Response(JSON.stringify({ status: "pending" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const BRPIX_API_KEY = Deno.env.get("BRPIX_API_KEY");
    if (!BRPIX_API_KEY) {
      return new Response(JSON.stringify({ status: "pending" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    try {
      const verifyRes = await fetch(`${BRPIX_BASE}/payments/${order.transaction_id}`, {
        headers: { "Authorization": `Bearer ${BRPIX_API_KEY}` },
      });

      if (!verifyRes.ok) {
        console.log(`[check-order-status] BrPix API error: HTTP ${verifyRes.status}`);
        return new Response(JSON.stringify({ status: "pending" }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const verifyData = await verifyRes.json();
      const paymentStatus = verifyData.data?.status || verifyData.status;
      const isPaidBoolean = verifyData.paid === true || verifyData.data?.paid === true;

      if (!isPaidBoolean && paymentStatus !== "paid" && paymentStatus !== "completed" && paymentStatus !== "approved") {
        return new Response(JSON.stringify({ status: "pending" }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // === PAYMENT CONFIRMED ON BRPIX — process immediately ===
      console.log(`[check-order-status] Payment confirmed on BrPix for order ${order_id}! Processing inline...`);

      // Mark as paid atomically (only if still pending)
      const { data: updated, error: updateError } = await supabase
        .from("orders")
        .update({ status: "paid", paid_at: new Date().toISOString() })
        .eq("id", order_id)
        .eq("status", "pending")
        .select("id")
        .maybeSingle();

      if (updateError || !updated) {
        console.log(`[check-order-status] Order ${order_id} already processed`);
        return new Response(JSON.stringify({ status: "paid" }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Credit wallet if user_id is set and it's a deposit
      if (order.order_type === "deposit" && order.user_id) {
        const { error: creditError } = await supabase.rpc("credit_wallet", {
          p_user_id: order.user_id,
          p_amount: Number(order.amount),
          p_description: "Depósito via PIX",
          p_reference_id: order_id,
        });

        if (creditError) {
          console.error(`[check-order-status] Credit error for ${order_id}:`, creditError);
        } else {
          console.log(`[check-order-status] Credited R$${order.amount} to user ${order.user_id}`);
        }
      }

      // Increment coupon usage if applicable
      if (order.coupon_id) {
        await supabase.rpc("increment_coupon_usage", { p_coupon_id: order.coupon_id }).catch(() => {});
      }

      return new Response(JSON.stringify({ status: "paid" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (verifyErr) {
      console.error("[check-order-status] BrPix verify error:", verifyErr);
      return new Response(JSON.stringify({ status: "pending" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (err) {
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
