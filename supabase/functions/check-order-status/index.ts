import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const ALLOWED_ORIGINS = [
  "https://painelcreditoslovbl.lovable.app",
  "https://id-preview--ea0a1e84-4673-4ceb-813b-b85a7cef0fd2.lovable.app",
];

function getCorsHeaders(req?: Request) {
  const origin = req?.headers.get("origin") || "";
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  };
}

const BRPIX_BASE = "https://finance.brpixpayments.com/api";

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { order_id } = await req.json();
    if (!order_id || typeof order_id !== "string" || order_id.length > 50) {
      return new Response(JSON.stringify({ error: "Missing order_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get order from DB
    const { data: order, error } = await supabase
      .from("orders")
      .select("status, transaction_id, amount, user_id, order_type, coupon_id")
      .eq("id", order_id)
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
      // Can't verify — return DB status
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
        // Already processed by webhook/reconcile — that's fine
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