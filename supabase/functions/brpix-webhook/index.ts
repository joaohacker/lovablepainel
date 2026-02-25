import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// No HMAC — security is handled by double-checking payment status directly with BrPix API

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const rawBody = await req.text();
    console.log("[brpix-webhook] Raw body:", rawBody);

    const body = JSON.parse(rawBody);
    const event = body.event;
    const transactionId = body.data?.transaction_id || body.transaction_id;

    console.log(`[brpix-webhook] Event: ${event}, TXN: ${transactionId}`);

    if (event !== "transaction.paid") {
      console.log(`[brpix-webhook] Ignoring event: ${event}`);
      return new Response(
        JSON.stringify({ ok: true, message: "Event ignored" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!transactionId) {
      return new Response(
        JSON.stringify({ error: "Missing transaction_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // SECURITY: Double-check payment status directly with BrPix API
    const BRPIX_API_KEY = Deno.env.get("BRPIX_API_KEY");
    if (!BRPIX_API_KEY) {
      console.error("[brpix-webhook] BRPIX_API_KEY not configured");
      return new Response(JSON.stringify({ error: "Payment verification unavailable" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const verifyRes = await fetch(`https://finance.brpixpayments.com/api/payments/${transactionId}`, {
      headers: { "Authorization": `Bearer ${BRPIX_API_KEY}` },
    });
    const verifyData = await verifyRes.json();
    console.log(`[brpix-webhook] BrPix verify response:`, JSON.stringify(verifyData));

    const paymentStatus = verifyData.data?.status || verifyData.status;
    const isPaid = verifyData.paid === true || verifyData.data?.paid === true;
    const hasPaidAt = !!(verifyData.paid_at || verifyData.data?.paid_at);

    if (!isPaid && !hasPaidAt && paymentStatus !== "paid" && paymentStatus !== "completed" && paymentStatus !== "approved") {
      console.error(`[brpix-webhook] Payment NOT confirmed. Status: ${paymentStatus}, paid: ${isPaid}, paid_at: ${hasPaidAt} — rejecting`);
      return new Response(JSON.stringify({ error: "Payment not confirmed by provider" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    console.log(`[brpix-webhook] ✓ Payment verified (status: ${paymentStatus})`);

    // Find the pending order
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("*")
      .eq("transaction_id", transactionId)
      .eq("status", "pending")
      .maybeSingle();

    if (orderError) {
      console.error("[brpix-webhook] DB error:", orderError);
      return new Response(JSON.stringify({ error: "DB error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!order) {
      console.log("[brpix-webhook] No pending order for TXN:", transactionId);
      return new Response(
        JSON.stringify({ ok: true, message: "No pending order" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ======= WALLET DEPOSIT FLOW =======
    if (order.order_type === "deposit") {
      const { error: updateError } = await supabase
        .from("orders")
        .update({ status: "paid", paid_at: new Date().toISOString() })
        .eq("id", order.id)
        .eq("status", "pending");

      if (updateError) {
        console.error("[brpix-webhook] Order update error:", updateError);
        return new Response(JSON.stringify({ error: "Order update failed" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (order.user_id) {
        const { data: creditResult, error: creditError } = await supabase.rpc("credit_wallet", {
          p_user_id: order.user_id,
          p_amount: Number(order.amount),
          p_description: "Depósito via PIX",
          p_reference_id: order.id,
        });

        if (creditError) {
          console.error("[brpix-webhook] Credit wallet error:", creditError);
          return new Response(JSON.stringify({ error: "Credit wallet failed" }), {
            status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const alreadyCredited = creditResult?.already_credited;
        console.log(`[brpix-webhook] Deposit ${order.id} ${alreadyCredited ? "(already credited)" : "paid"} → R$${order.amount}`);
      } else {
        console.log(`[brpix-webhook] Anonymous deposit ${order.id} paid → R$${order.amount}. Awaiting claim.`);
      }

      if (order.coupon_id) {
        await supabase.rpc("increment_coupon_usage", { p_coupon_id: order.coupon_id }).catch(() => {});
      }

      return new Response(JSON.stringify({ ok: true, type: "deposit" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ======= UPGRADE FLOWS =======
    if (order.order_type === "upgrade_daily" || order.order_type === "upgrade_per_use") {
      const field = order.order_type === "upgrade_daily" ? "daily_limit" : "credits_per_use";
      const increment = order.upgrade_increment;

      if (!order.token_id || !increment) {
        return new Response(JSON.stringify({ error: "Invalid upgrade order" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: tokenRow } = await supabase
        .from("tokens").select(field).eq("id", order.token_id).single();

      if (!tokenRow) {
        return new Response(JSON.stringify({ error: "Token not found" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const currentValue = (tokenRow as Record<string, number | null>)[field] || 0;
      await supabase.from("tokens").update({ [field]: currentValue + increment }).eq("id", order.token_id);
      await supabase.from("orders").update({ status: "paid", paid_at: new Date().toISOString() }).eq("id", order.id);

      console.log(`[brpix-webhook] Upgrade ${order.order_type}: token ${order.token_id} ${field} ${currentValue} → ${currentValue + increment}`);
      return new Response(JSON.stringify({ ok: true, type: order.order_type }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ======= TOKEN FLOW =======
    const { data: product } = await supabase.from("products").select("*").eq("id", order.product_id).single();
    if (!product) {
      return new Response(JSON.stringify({ error: "Product not found" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: adminRole } = await supabase.from("user_roles").select("user_id").eq("role", "admin").limit(1).single();
    if (!adminRole) {
      return new Response(JSON.stringify({ error: "No admin" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: token, error: tokenError } = await supabase
      .from("tokens")
      .insert({
        client_name: order.customer_name,
        created_by: adminRole.user_id,
        credits_per_use: product.credits_per_use,
        total_limit: product.total_limit,
        daily_limit: product.daily_limit,
        is_active: true,
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .select()
      .single();

    if (tokenError) {
      return new Response(JSON.stringify({ error: "Token creation failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await supabase.from("orders").update({
      status: "paid", paid_at: new Date().toISOString(), token_id: token.id,
    }).eq("id", order.id);

    console.log(`[brpix-webhook] Order ${order.id} paid → token ${token.token} created`);
    return new Response(JSON.stringify({ ok: true, token_id: token.id }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[brpix-webhook] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
