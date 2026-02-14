import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { encode as hexEncode } from "https://deno.land/std@0.168.0/encoding/hex.ts";

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
    console.log("[brpix-webhook] Raw body:", rawBody);

    // Validate webhook signature
    const webhookSecret = Deno.env.get("BRPIX_WEBHOOK_SECRET");
    if (webhookSecret) {
      const signature = req.headers.get("x-webhook-signature");
      if (!signature) {
        console.error("[brpix-webhook] Missing signature header");
        return new Response(JSON.stringify({ error: "Missing signature" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const valid = await verifySignature(rawBody, signature, webhookSecret);
      if (!valid) {
        console.error("[brpix-webhook] Invalid signature");
        return new Response(JSON.stringify({ error: "Invalid signature" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const body = JSON.parse(rawBody);
    const event = body.event;
    const transactionId = body.transaction_id;

    console.log(`[brpix-webhook] Event: ${event}, TXN: ${transactionId}`);

    // Only process payment confirmations
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

    // Get product config
    const { data: product } = await supabase
      .from("products")
      .select("*")
      .eq("id", order.product_id)
      .single();

    if (!product) {
      console.error("[brpix-webhook] Product not found:", order.product_id);
      return new Response(JSON.stringify({ error: "Product not found" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find admin for token ownership
    const { data: adminRole } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin")
      .limit(1)
      .single();

    if (!adminRole) {
      console.error("[brpix-webhook] No admin user found");
      return new Response(JSON.stringify({ error: "No admin" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create access token
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
      console.error("[brpix-webhook] Token creation error:", tokenError);
      return new Response(JSON.stringify({ error: "Token creation failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update order as paid
    await supabase
      .from("orders")
      .update({
        status: "paid",
        paid_at: new Date().toISOString(),
        token_id: token.id,
      })
      .eq("id", order.id);

    console.log(`[brpix-webhook] Order ${order.id} paid → token ${token.token} created for ${order.customer_name}`);

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
