import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { encode as hexEncode } from "https://deno.land/std@0.168.0/encoding/hex.ts";

// Webhook keeps wildcard CORS — requests come from BrPix server, not browser
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function verifySignature(payload: string, signature: string, secret: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  const expectedSig = new TextDecoder().decode(hexEncode(new Uint8Array(sig)));
  return expectedSig === signature;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const rawBody = await req.text();
    // SECURITY: Don't log raw webhook body

    // SECURITY: Validate webhook signature if present
    const webhookSecret = Deno.env.get("BRPIX_WEBHOOK_SECRET");
    const signature = req.headers.get("x-webhook-signature");

    if (webhookSecret && signature) {
      const valid = await verifySignature(rawBody, signature, webhookSecret);
      if (!valid) {
        console.error("[brpix-webhook] Invalid signature — rejecting");
        return new Response(JSON.stringify({ error: "Invalid signature" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const body = JSON.parse(rawBody);
    const event = body.event;
    const transactionId = body.data?.transaction_id || body.transaction_id;

    console.log(`[brpix-webhook] Event: ${event}, TXN: ${transactionId}`);

    // Only process payment confirmations
    if (event !== "transaction.paid") {
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

    // === ANTI-REPLAY: Deduplicate webhook events ===
    const { error: dedupeError } = await supabase
      .from("webhook_events")
      .insert({ transaction_id: transactionId, event_type: event });

    if (dedupeError) {
      // Unique constraint violation = already processed
      if (dedupeError.code === "23505") {
        console.log(`[brpix-webhook] TXN ${transactionId}: already processed (anti-replay)`);
        return new Response(
          JSON.stringify({ ok: true, message: "Already processed" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      console.error("[brpix-webhook] Dedupe insert error:", dedupeError);
    }

    // SECURITY: Double-check payment status directly with BrPix API
    const BRPIX_API_KEY = Deno.env.get("BRPIX_API_KEY");
    if (!BRPIX_API_KEY) {
      console.error("[brpix-webhook] BRPIX_API_KEY not configured");
      return new Response(JSON.stringify({ error: "Payment verification unavailable" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    try {
      const verifyRes = await fetch(`https://finance.brpixpayments.com/api/payments/${transactionId}`, {
        headers: { "Authorization": `Bearer ${BRPIX_API_KEY}` },
      });
      const verifyData = await verifyRes.json();
      const paymentStatus = verifyData.data?.status || verifyData.status;
      console.log(`[brpix-webhook] TXN ${transactionId}: verified status=${paymentStatus}`);

      if (paymentStatus !== "paid" && paymentStatus !== "completed" && paymentStatus !== "approved") {
        console.error(`[brpix-webhook] Payment NOT confirmed. Status: ${paymentStatus}`);
        return new Response(JSON.stringify({ error: "Payment not confirmed by provider" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } catch (verifyErr) {
      console.error("[brpix-webhook] Failed to verify payment:", verifyErr);
      return new Response(JSON.stringify({ error: "Payment verification failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
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
        .update({
          status: "paid",
          paid_at: new Date().toISOString(),
        })
        .eq("id", order.id)
        .eq("status", "pending");

      if (updateError) {
        console.error("[brpix-webhook] Order update error:", updateError);
        return new Response(JSON.stringify({ error: "Order update failed" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (order.user_id) {
        const { error: creditError } = await supabase.rpc("credit_wallet", {
          p_user_id: order.user_id,
          p_amount: Number(order.amount),
          p_description: `Depósito via PIX`,
          p_reference_id: order.id,
        });

        if (creditError) {
          console.error("[brpix-webhook] Credit wallet error:", creditError);
          return new Response(JSON.stringify({ error: "Credit wallet failed" }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        console.log(`[brpix-webhook] Deposit ${order.id} paid → R$${order.amount} for user ${order.user_id}`);
      } else {
        console.log(`[brpix-webhook] Anonymous deposit ${order.id} paid → R$${order.amount}. Awaiting claim.`);
      }

      if (order.coupon_id) {
        await supabase.rpc("increment_coupon_usage", { p_coupon_id: order.coupon_id }).catch((e: any) => {
          console.error("[brpix-webhook] Coupon increment error:", e);
        });
      }

      return new Response(
        JSON.stringify({ ok: true, type: "deposit" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ======= UPGRADE FLOWS =======
    if (order.order_type === "upgrade_daily" || order.order_type === "upgrade_per_use") {
      const field = order.order_type === "upgrade_daily" ? "daily_limit" : "credits_per_use";
      const increment = order.upgrade_increment;

      if (!order.token_id || !increment) {
        return new Response(JSON.stringify({ error: "Invalid upgrade order" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: tokenRow, error: tokenErr } = await supabase
        .from("tokens")
        .select(field)
        .eq("id", order.token_id)
        .single();

      if (tokenErr || !tokenRow) {
        return new Response(JSON.stringify({ error: "Token not found" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const currentValue = (tokenRow as Record<string, number | null>)[field] || 0;
      const newValue = currentValue + increment;

      await supabase
        .from("tokens")
        .update({ [field]: newValue })
        .eq("id", order.token_id);

      await supabase
        .from("orders")
        .update({ status: "paid", paid_at: new Date().toISOString() })
        .eq("id", order.id);

      console.log(`[brpix-webhook] Upgrade ${order.order_type}: token ${order.token_id} ${field} ${currentValue} → ${newValue}`);

      return new Response(
        JSON.stringify({ ok: true, type: order.order_type, new_value: newValue }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ======= ORIGINAL TOKEN FLOW =======
    const { data: product } = await supabase
      .from("products")
      .select("*")
      .eq("id", order.product_id)
      .single();

    if (!product) {
      return new Response(JSON.stringify({ error: "Product not found" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: adminRole } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin")
      .limit(1)
      .single();

    if (!adminRole) {
      return new Response(JSON.stringify({ error: "No admin" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
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
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await supabase
      .from("orders")
      .update({
        status: "paid",
        paid_at: new Date().toISOString(),
        token_id: token.id,
      })
      .eq("id", order.id);

    console.log(`[brpix-webhook] Order ${order.id} paid → token created for ${order.customer_name}`);

    return new Response(
      JSON.stringify({ ok: true, token_id: token.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[brpix-webhook] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
