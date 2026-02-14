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

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const body = await req.json();
    console.log("[brpix-webhook] Received:", JSON.stringify(body));

    // Validate webhook signature if secret is configured
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
      // TODO: HMAC-SHA256 validation when secret is set
    }

    // Extract payment info from webhook payload
    const { event, data } = body;

    if (event === "payment.approved" || event === "PAYMENT_RECEIVED" || body.status === "approved" || body.status === "paid") {
      const transactionId = data?.id || body.transaction_id || body.id;
      
      console.log(`[brpix-webhook] Payment approved: ${transactionId}`);

      // Find the order by transaction_id
      const { data: order, error: orderError } = await supabase
        .from("orders")
        .select("*")
        .eq("transaction_id", String(transactionId))
        .eq("status", "pending")
        .maybeSingle();

      if (orderError) {
        console.error("[brpix-webhook] Error finding order:", orderError);
        return new Response(JSON.stringify({ error: "DB error" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!order) {
        console.log("[brpix-webhook] No pending order found for transaction:", transactionId);
        return new Response(JSON.stringify({ ok: true, message: "No pending order found" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Get product to create token with correct limits
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

      // Find an admin user to be the token creator
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
          expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
        })
        .select()
        .single();

      if (tokenError) {
        console.error("[brpix-webhook] Error creating token:", tokenError);
        return new Response(JSON.stringify({ error: "Token creation failed" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Update order as paid with token_id
      await supabase
        .from("orders")
        .update({
          status: "paid",
          paid_at: new Date().toISOString(),
          token_id: token.id,
        })
        .eq("id", order.id);

      console.log(`[brpix-webhook] Order ${order.id} paid, token ${token.token} created`);

      // TODO: Send email to customer with token link

      return new Response(
        JSON.stringify({ ok: true, token_id: token.id }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Non-payment events - just acknowledge
    return new Response(
      JSON.stringify({ ok: true, message: "Event received" }),
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
