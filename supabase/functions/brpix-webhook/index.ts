import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyBrPixPayment } from "../_shared/brpix-helpers.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // SECURITY: Validate webhook secret to prevent forged calls
  const WEBHOOK_SECRET = Deno.env.get("BRPIX_WEBHOOK_SECRET");
  if (!WEBHOOK_SECRET) {
    console.error("[brpix-webhook] REJECTED: BRPIX_WEBHOOK_SECRET not configured");
    return new Response(JSON.stringify({ error: "Service unavailable" }), {
      status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const incomingSecret =
    req.headers.get("x-webhook-secret") ||
    req.headers.get("authorization")?.replace("Bearer ", "") ||
    new URL(req.url).searchParams.get("secret");

  if (incomingSecret !== WEBHOOK_SECRET) {
    console.error("[brpix-webhook] REJECTED: Invalid or missing webhook secret");
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const rawBody = await req.text();
    // SECURITY: Don't log raw body (may contain sensitive payment data)

    const body = JSON.parse(rawBody);
    const event = body.event;
    const transactionId = body.data?.transaction_id || body.transaction_id;

    console.log(`[brpix-webhook] Event: ${event}, TXN: ${transactionId}`);

    if (event !== "transaction.paid") {
      return new Response(JSON.stringify({ ok: true, message: "Event ignored" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!transactionId) {
      return new Response(JSON.stringify({ error: "Missing transaction_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // SECURITY: Double-check payment status directly with BrPix API
    const BRPIX_API_KEY = Deno.env.get("BRPIX_API_KEY");
    if (!BRPIX_API_KEY) {
      console.error("[brpix-webhook] BRPIX_API_KEY not configured");
      return new Response(JSON.stringify({ error: "Payment verification unavailable" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const verification = await verifyBrPixPayment(transactionId, BRPIX_API_KEY);
    
    if (verification.error) {
      console.error(`[brpix-webhook] BrPix verify error: ${verification.error}`);
      return new Response(JSON.stringify({ error: "Payment verification failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[brpix-webhook] BrPix verify: paid=${verification.paid}, amount=${verification.amount}, raw=${JSON.stringify(verification.rawData).substring(0, 500)}`);

    if (!verification.paid) {
      console.error(`[brpix-webhook] Payment NOT confirmed — rejecting`);
      return new Response(JSON.stringify({ error: "Payment not confirmed by provider" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    console.log(`[brpix-webhook] ✓ Payment verified`);

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
      return new Response(JSON.stringify({ ok: true, message: "No pending order" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // SECURITY: Verify paid amount matches expected amount (order amount minus discount)
    const paidAmount = verification.amount;
    const expectedAmount = Number(order.amount) - Number(order.discount_amount || 0);
    if (paidAmount > 0 && Math.abs(paidAmount - expectedAmount) > 0.50) {
      console.error(`[brpix-webhook] AMOUNT MISMATCH! Paid: ${paidAmount}, Expected: ${expectedAmount}, Order: ${order.id}`);
      await supabase.from("fraud_attempts").insert({
        user_id: order.user_id,
        ip_address: "webhook",
        action: "amount_mismatch",
        details: { order_id: order.id, paid: paidAmount, expected: expectedAmount, transaction_id: transactionId },
      }).catch(() => {});
      return new Response(JSON.stringify({ error: "Amount mismatch" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ======= WALLET DEPOSIT FLOW =======
    if (order.order_type === "deposit") {
      if (order.user_id) {
        console.log(`[brpix-webhook] Processing wallet deposit for user ${order.user_id}, amount ${order.amount}`);

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

        const alreadyCredited = creditResult?.already_credited === true;
        console.log(`[brpix-webhook] Wallet deposit ${order.id} ${alreadyCredited ? '(already credited)' : 'credited'} → R$${order.amount}`);
      }

      const { data: updatedRows, error: updateError } = await supabase
        .from("orders")
        .update({ status: "paid", paid_at: new Date().toISOString() })
        .eq("id", order.id)
        .eq("status", "pending")
        .select("id");

      if (updateError) {
        console.error("[brpix-webhook] Order update error:", updateError);
        return new Response(JSON.stringify({ error: "Order update failed" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!order.user_id) {
        console.log(`[brpix-webhook] Anonymous deposit ${order.id} paid → R$${order.amount}. Awaiting claim.`);
      }

      if (order.coupon_id && updatedRows && updatedRows.length > 0) {
        await supabase.rpc("increment_coupon_usage", { p_coupon_id: order.coupon_id }).catch((e: any) => {
          console.error("[brpix-webhook] Coupon increment error:", e);
        });
      }

      // ======= REFERRAL COMMISSION (10% on FIRST deposit only) =======
      if (order.user_id && updatedRows && updatedRows.length > 0) {
        try {
          // Check if this user was referred
          const { data: referral } = await supabase
            .from("referrals")
            .select("id, referrer_id, commission_paid")
            .eq("referred_id", order.user_id)
            .maybeSingle();

          if (referral && !referral.commission_paid) {
            // Atomic update to prevent race condition: only pay if commission_paid is still false
            const { data: lockResult, error: lockError } = await supabase
              .from("referrals")
              .update({ commission_paid: true })
              .eq("id", referral.id)
              .eq("commission_paid", false)
              .select("id");

            // If no rows updated, another webhook already paid the commission
            if (!lockError && lockResult && lockResult.length > 0) {
              const commission = Math.round(Number(order.amount) * 0.10 * 100) / 100; // 10%
              if (commission > 0) {
                const refId = `referral_${referral.id}_${order.id}`;
                const { data: creditResult } = await supabase.rpc("credit_wallet", {
                  p_user_id: referral.referrer_id,
                  p_amount: commission,
                  p_description: `Comissão de indicação (10% de R$${Number(order.amount).toFixed(2)})`,
                  p_reference_id: refId,
                });

                if (creditResult?.success && !creditResult?.already_credited) {
                  // Update commission amount
                  await supabase
                    .from("referrals")
                    .update({ commission_amount: commission })
                    .eq("id", referral.id);
                  console.log(`[brpix-webhook] Referral commission: R$${commission} credited to ${referral.referrer_id}`);
                }
              }
            }
          }
        } catch (refErr) {
          // Don't fail the whole webhook for referral errors
          console.error("[brpix-webhook] Referral commission error:", refErr);
        }
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
      await supabase.from("orders").update({ status: "paid", paid_at: new Date().toISOString() }).eq("id", order.id).eq("status", "pending");

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
    }).eq("id", order.id).eq("status", "pending");

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
