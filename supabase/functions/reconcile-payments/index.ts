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

  // SECURITY: Only allow cron (service role) or admin users
  const authHeader = req.headers.get("authorization");
  const isServiceRole = authHeader === `Bearer ${supabaseServiceKey}`;

  if (!isServiceRole) {
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
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    const { data: roleCheck } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleCheck) {
      return new Response(JSON.stringify({ error: "Admin only" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  const BRPIX_API_KEY = Deno.env.get("BRPIX_API_KEY");
  if (!BRPIX_API_KEY) {
    return new Response(JSON.stringify({ error: "BRPIX_API_KEY not configured" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Find pending orders older than 2 minutes (give webhook time to arrive first)
    // but younger than 24 hours (PIX expiration)
    const { data: pendingOrders, error: fetchError } = await supabase
      .from("orders")
      .select("id, transaction_id, amount, user_id, order_type, coupon_id, token_id, upgrade_increment, product_id, customer_name")
      .eq("status", "pending")
      .not("transaction_id", "is", null)
      .lt("created_at", new Date(Date.now() - 2 * 60 * 1000).toISOString())
      .gt("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .order("created_at", { ascending: true })
      .limit(200);

    if (fetchError) {
      console.error("[reconcile] DB fetch error:", fetchError);
      return new Response(JSON.stringify({ error: "DB fetch error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!pendingOrders || pendingOrders.length === 0) {
      console.log("[reconcile] No pending orders to check");
      return new Response(JSON.stringify({ ok: true, checked: 0, credited: 0 }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[reconcile] Checking ${pendingOrders.length} pending orders...`);

    let credited = 0;

    for (const order of pendingOrders) {
      try {
        const verifyRes = await fetch(`${BRPIX_BASE}/payments/${order.transaction_id}`, {
          headers: { "Authorization": `Bearer ${BRPIX_API_KEY}` },
        });
        
        if (!verifyRes.ok) {
          console.error(`[reconcile] BrPix API error for ${order.transaction_id}: HTTP ${verifyRes.status}`);
          continue;
        }
        
        const verifyData = await verifyRes.json();
        console.log(`[reconcile] Order ${order.id} (${order.transaction_id}): FULL BrPix response = ${JSON.stringify(verifyData).substring(0, 500)}`);
        
        const paymentStatus = verifyData.data?.status || verifyData.status;
        const isPaidBoolean = verifyData.paid === true || verifyData.data?.paid === true;
        
        console.log(`[reconcile] Order ${order.id}: parsed status = ${paymentStatus}, paid flag = ${isPaidBoolean}`);

        if (!isPaidBoolean && paymentStatus !== "paid" && paymentStatus !== "completed" && paymentStatus !== "approved") {
          continue;
        }

        console.log(`[reconcile] Order ${order.id} is PAID on BrPix (status: ${paymentStatus}). Processing...`);

        // === DEPOSIT FLOW ===
        if (order.order_type === "deposit") {
          const { data: updatedRows, error: updateError } = await supabase
            .from("orders")
            .update({ status: "paid", paid_at: new Date().toISOString() })
            .eq("id", order.id)
            .eq("status", "pending")
            .select("id");

          if (updateError) {
            console.error(`[reconcile] UPDATE ERROR for order ${order.id}:`, updateError);
            continue;
          }

          if (!updatedRows || updatedRows.length === 0) {
            console.log(`[reconcile] Order ${order.id} already processed by another worker, skipping`);
            continue;
          }

          if (order.user_id) {
            const { data: creditResult, error: creditError } = await supabase.rpc("credit_wallet", {
              p_user_id: order.user_id,
              p_amount: Number(order.amount),
              p_description: "Depósito via PIX (reconciliação automática)",
              p_reference_id: order.id,
            });
            if (creditError) {
              console.error(`[reconcile] Credit error for order ${order.id}:`, creditError);
              continue;
            }
            const alreadyCredited = creditResult?.already_credited;
            console.log(`[reconcile] ${alreadyCredited ? 'SKIP (already credited)' : 'Credited'} R$${order.amount} to user ${order.user_id}`);
          } else {
            console.log(`[reconcile] Anonymous deposit ${order.id} — marked paid, awaiting claim`);
          }

          if (order.coupon_id) {
            await supabase.rpc("increment_coupon_usage", { p_coupon_id: order.coupon_id }).catch(() => {});
          }

          credited++;
          continue;
        }

        // === UPGRADE FLOWS ===
        if (order.order_type === "upgrade_daily" || order.order_type === "upgrade_per_use") {
          const field = order.order_type === "upgrade_daily" ? "daily_limit" : "credits_per_use";
          if (!order.token_id || !order.upgrade_increment) continue;

          const { data: tokenRow } = await supabase
            .from("tokens")
            .select(field)
            .eq("id", order.token_id)
            .single();

          if (!tokenRow) continue;

          const currentValue = (tokenRow as Record<string, number | null>)[field] || 0;
          await supabase
            .from("tokens")
            .update({ [field]: currentValue + order.upgrade_increment })
            .eq("id", order.token_id);

          await supabase
            .from("orders")
            .update({ status: "paid", paid_at: new Date().toISOString() })
            .eq("id", order.id)
            .eq("status", "pending");

          console.log(`[reconcile] Upgrade ${order.order_type}: token ${order.token_id} ${field} +${order.upgrade_increment}`);
          credited++;
          continue;
        }

        // === TOKEN FLOW ===
        const { data: product } = await supabase
          .from("products")
          .select("*")
          .eq("id", order.product_id)
          .single();

        if (!product) continue;

        const { data: adminRole } = await supabase
          .from("user_roles")
          .select("user_id")
          .eq("role", "admin")
          .limit(1)
          .single();

        if (!adminRole) continue;

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

        if (tokenError) continue;

        await supabase
          .from("orders")
          .update({ status: "paid", paid_at: new Date().toISOString(), token_id: token.id })
          .eq("id", order.id)
          .eq("status", "pending");

        console.log(`[reconcile] Token order ${order.id} → token ${token.token} created`);
        credited++;
      } catch (err) {
        console.error(`[reconcile] Error processing order ${order.id}:`, err);
      }
    }

    console.log(`[reconcile] Done. Checked: ${pendingOrders.length}, Credited: ${credited}`);

    return new Response(JSON.stringify({ ok: true, checked: pendingOrders.length, credited }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[reconcile] Error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
