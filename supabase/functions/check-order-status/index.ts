import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { verifyBrPixPayment, extractBrPixAmount } from "../_shared/brpix-helpers.ts";

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
    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const body = await req.json();
    const { order_id, customer_email } = body;

    if (!order_id || typeof order_id !== "string" || order_id.length > 50) {
      return new Response(JSON.stringify({ error: "Missing order_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Determine if authenticated or public checkout
    const authHeader = req.headers.get("authorization");
    let userId: string | null = null;
    let isPublicCheckout = false;

    if (authHeader && authHeader.startsWith("Bearer ")) {
      try {
        // Use getClaims for signing-keys compatibility
        const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
        const userClient = createClient(supabaseUrl, anonKey, {
          global: { headers: { Authorization: authHeader } },
        });
        const token = authHeader.replace("Bearer ", "");
        const { data: claimsData, error: authError } = await userClient.auth.getClaims(token);
        if (!authError && claimsData?.claims) {
          userId = claimsData.claims.sub as string;

          // SECURITY: Check if user is banned
          const { data: isBanned } = await supabase.rpc("is_user_banned", { p_user_id: userId });
          if (isBanned) {
            return new Response(JSON.stringify({ error: "⛔ Conta suspensa." }), {
              status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        }
      } catch (authErr) {
        console.warn("[check-order-status] Auth verification failed:", authErr);
      }
    }

    if (!userId) {
      // Public checkout mode: require customer_email for ownership verification
      if (!customer_email || typeof customer_email !== "string" || customer_email.length > 200) {
        return new Response(JSON.stringify({ error: "Auth or email required" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      isPublicCheckout = true;
    }

    // SECURITY: Check if IP is banned
    const { data: isIpBanned } = await supabase.rpc("is_ip_banned", { p_ip: clientIp });
    if (isIpBanned) {
      return new Response(JSON.stringify({ error: "⛔ Acesso bloqueado." }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // SECURITY: Rate limiting — 60 requests per 60 seconds (high because of polling)
    const rateLimitId = userId || `anon_${clientIp}`;
    const { data: rateCheck } = await supabase.rpc("check_rate_limit", {
      p_user_id: rateLimitId,
      p_ip: clientIp,
      p_endpoint: "check-order-status",
      p_max_requests: 60,
      p_window_seconds: 60,
    });
    if (rateCheck && !rateCheck.allowed) {
      return new Response(JSON.stringify({ error: "Muitas requisições. Aguarde." }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get order from DB — SECURITY: ownership verified by user_id or email
    let orderQuery = supabase
      .from("orders")
      .select("status, transaction_id, amount, user_id, order_type, coupon_id, discount_amount, token_id")
      .eq("id", order_id);

    if (isPublicCheckout) {
      orderQuery = orderQuery.eq("customer_email", customer_email).is("user_id", null);
    } else {
      orderQuery = orderQuery.eq("user_id", userId!);
    }

    const { data: order, error } = await orderQuery.maybeSingle();

    if (error || !order) {
      return new Response(JSON.stringify({ status: "not_found" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Helper: resolve token value from token_id for public checkout responses
    const resolveTokenValue = async (tokenId: string | null) => {
      if (!tokenId || !isPublicCheckout) return undefined;
      const { data: t } = await supabase.from("tokens").select("token").eq("id", tokenId).maybeSingle();
      return t?.token || undefined;
    };

    // If already paid, return immediately
    if (order.status !== "pending") {
      const tv = await resolveTokenValue(order.token_id);
      return new Response(JSON.stringify({ status: order.status, ...(tv ? { token_value: tv } : {}) }), {
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
      const verification = await verifyBrPixPayment(order.transaction_id, BRPIX_API_KEY);

      if (verification.error) {
        console.log(`[check-order-status] BrPix API error: ${verification.error}`);
        return new Response(JSON.stringify({ status: "pending" }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      console.log(`[check-order-status] Order ${order_id}: paid=${verification.paid}, amount=${verification.amount}, raw=${JSON.stringify(verification.rawData).substring(0, 500)}`);

      if (!verification.paid) {
        return new Response(JSON.stringify({ status: "pending" }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // SECURITY: Verify paid amount matches expected amount
      const paidAmount = verification.amount;
      const expectedAmount = Number(order.amount) - Number(order.discount_amount || 0);
      if (paidAmount > 0 && Math.abs(paidAmount - expectedAmount) > 0.50) {
        console.error(`[check-order-status] AMOUNT MISMATCH! Paid: ${paidAmount}, Expected: ${expectedAmount}, Order: ${order_id}`);
        await supabase.from("fraud_attempts").insert({
          user_id: userId,
          ip_address: clientIp,
          action: "amount_mismatch",
          details: { order_id, paid: paidAmount, expected: expectedAmount },
        }).catch(() => {});
        return new Response(JSON.stringify({ status: "error", error: "Valor divergente" }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // === PAYMENT CONFIRMED ON BRPIX — process immediately ===
      console.log(`[check-order-status] Payment confirmed on BrPix for order ${order_id}! Processing inline...`);

      // For deposits, credit first (idempotent by reference_id)
      if (order.order_type === "deposit" && order.user_id) {
        const { data: creditResult, error: creditError } = await supabase.rpc("credit_wallet", {
          p_user_id: order.user_id,
          p_amount: Number(order.amount),
          p_description: "Depósito via PIX",
          p_reference_id: order_id,
        });

        if (creditError) {
          console.error(`[check-order-status] Credit error for ${order_id}:`, creditError);
          return new Response(JSON.stringify({ status: "pending" }), {
            status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const alreadyCredited = creditResult?.already_credited === true;
        console.log(`[check-order-status] ${alreadyCredited ? "Credit already applied" : "Wallet credited"} for ${order_id}`);
      }

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
      }

      // Increment coupon usage only when we transitioned pending -> paid
      if (updated && order.coupon_id) {
        await supabase.rpc("increment_coupon_usage", { p_coupon_id: order.coupon_id }).catch(() => {});
      }

      const tv = await resolveTokenValue(order.token_id);
      return new Response(JSON.stringify({ status: "paid", ...(tv ? { token_value: tv } : {}) }), {
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
