import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const API_BASE = "https://api.lovablextensao.shop";
const MAX_CONCURRENT = 8;

// SECURITY: Whitelist of allowed status values from frontend
// NOTE: "completed" is intentionally EXCLUDED — only the backend (farm-proxy/auto-refund) can mark completed
const ALLOWED_STATUS_VALUES = [
  "running", "expired", "cancelled", "error",
  "waiting_invite", "queued", "creating", "active",
];

async function getActiveGenerationCount(supabase: ReturnType<typeof createClient>): Promise<number> {
  const now = new Date();
  const tenMinAgo = new Date(now.getTime() - 10 * 60 * 1000).toISOString();
  const twelveMinAgo = new Date(now.getTime() - 12 * 60 * 1000).toISOString();
  const threeMinAgo = new Date(now.getTime() - 3 * 60 * 1000).toISOString();

  const { count: runningCount } = await supabase
    .from("generations")
    .select("id", { count: "exact", head: true })
    .eq("status", "running")
    .gte("updated_at", tenMinAgo);

  const { count: waitingCount } = await supabase
    .from("generations")
    .select("id", { count: "exact", head: true })
    .eq("status", "waiting_invite")
    .gte("created_at", twelveMinAgo);

  const { count: creatingCount } = await supabase
    .from("generations")
    .select("id", { count: "exact", head: true })
    .eq("status", "creating")
    .gte("created_at", threeMinAgo);

  return (runningCount || 0) + (waitingCount || 0) + (creatingCount || 0);
}

async function getQueuePosition(supabase: ReturnType<typeof createClient>, generationId: string): Promise<number> {
  const { data: gen } = await supabase
    .from("generations")
    .select("created_at")
    .eq("id", generationId)
    .single();
  if (!gen) return 0;
  const { count } = await supabase
    .from("generations")
    .select("id", { count: "exact", head: true })
    .eq("status", "queued")
    .lt("created_at", gen.created_at);
  return (count || 0) + 1;
}

// === INPUT SANITIZATION ===
function _sanitize(input: string, maxLen = 200): string {
  return input.replace(/<[^>]*>/g, '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim().slice(0, maxLen);
}

// === PAYLOAD OBFUSCATION ===
function _dc(p: string): any { try { const a = p.split(''); for (let i = 0; i < a.length - 1; i += 2) [a[i], a[i+1]] = [a[i+1], a[i]]; return JSON.parse(decodeURIComponent(escape(atob(a.reverse().join(''))))); } catch { return null; } }
function _ec(d: any): string { const b = btoa(unescape(encodeURIComponent(JSON.stringify(d)))).split('').reverse(); for (let i = 0; i < b.length - 1; i += 2) [b[i], b[i+1]] = [b[i+1], b[i]]; return b.join(''); }

const _handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const FARM_API_KEY = Deno.env.get("FARM_API_KEY")!;

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

    // SECURITY: Check if IP is banned
    const { data: isIpBanned } = await supabase.rpc("is_ip_banned", { p_ip: clientIp });
    if (isIpBanned) {
      return new Response(JSON.stringify({ error: "⛔ Acesso bloqueado." }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // SECURITY: Rate limiting — 15 requests per 5 minutes per IP
    const { data: rateCheck } = await supabase.rpc("check_rate_limit", {
      p_user_id: "00000000-0000-0000-0000-000000000000",
      p_ip: clientIp,
      p_endpoint: "client-generate",
      p_max_requests: 15,
      p_window_seconds: 300,
    });
    if (rateCheck && !rateCheck.allowed) {
      return new Response(JSON.stringify({ error: "Muitas tentativas. Aguarde." }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { action, token, credits, farmId, creditsEarned, status, workspaceName } = body;

    if (!token || typeof token !== "string") {
      return new Response(
        JSON.stringify({ error: "Token obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate token
    const { data: clientToken, error: tokenError } = await supabase
      .from("client_tokens")
      .select("id, token, total_credits, credits_used, is_active, owner_id")
      .eq("token", token)
      .maybeSingle();

    if (tokenError || !clientToken) {
      return new Response(
        JSON.stringify({ error: "Link inválido" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!clientToken.is_active) {
      return new Response(
        JSON.stringify({ error: "Link desativado" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const remaining = clientToken.total_credits - clientToken.credits_used;

    // Helper: calculate REAL remaining based on actually delivered credits
    async function getRealRemaining(): Promise<{ realRemaining: number; hasActiveGen: boolean }> {
      const { data: allGens } = await supabase
        .from("generations")
        .select("credits_requested, credits_earned, status, settled_at")
        .eq("client_token_id", clientToken.id);

      let totalDelivered = 0;
      let hasActiveGen = false;

      if (allGens) {
        for (const g of allGens) {
          const earned = g.credits_earned ?? 0;
          if (g.status === "completed" || g.status === "running") {
            totalDelivered += earned;
          }
          if (!g.settled_at && ["waiting_invite", "queued", "pending", "creating", "active", "running"].includes(g.status)) {
            hasActiveGen = true;
          }
        }
      }

      return {
        realRemaining: clientToken.total_credits - totalDelivered,
        hasActiveGen,
      };
    }

    // === VALIDATE ===
    if (action === "validate") {
      const { realRemaining, hasActiveGen } = await getRealRemaining();

      return new Response(
        JSON.stringify({
          success: true,
          total_credits: clientToken.total_credits,
          credits_used: clientToken.credits_used,
          remaining: realRemaining,
          has_active_generation: hasActiveGen,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // === CHECK-QUEUE ===
    if (action === "check-queue") {
      const { generationId } = body;
      if (!generationId) {
        return new Response(JSON.stringify({ error: "generationId obrigatório" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: gen } = await supabase
        .from("generations")
        .select("id, farm_id, status, master_email, credits_requested, created_at")
        .eq("id", generationId)
        .eq("client_token_id", clientToken.id)
        .single();

      if (!gen) {
        return new Response(JSON.stringify({ error: "Geração não encontrada" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (gen.status === "queued") {
        const position = await getQueuePosition(supabase, gen.id);
        return new Response(JSON.stringify({
          status: "queued",
          queuePosition: position,
          generationId: gen.id,
        }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({
        status: gen.status,
        farmId: gen.farm_id,
        masterEmail: gen.master_email,
        generationId: gen.id,
        credits: gen.credits_requested,
      }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // === UPDATE STATUS (push from frontend) ===
    if (action === "update-status") {
      if (!farmId) {
        return new Response(
          JSON.stringify({ error: "farmId obrigatório" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const updateData: Record<string, any> = {};

      if (status) {
        if (!ALLOWED_STATUS_VALUES.includes(status)) {
          return new Response(
            JSON.stringify({ error: "Status inválido" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // SECURITY: Block frontend from setting terminal statuses on running generations
        // This prevents the exploit where client cancels a running generation to trigger refund
        if (["cancelled", "expired", "error"].includes(status)) {
          const { data: currentGen } = await supabase
            .from("generations")
            .select("status, credits_earned")
            .eq("farm_id", farmId)
            .eq("client_token_id", clientToken.id)
            .maybeSingle();

          if (currentGen && currentGen.status === "running") {
            return new Response(
              JSON.stringify({ error: "Não é possível cancelar geração em execução pelo frontend" }),
              { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
          // Also block if credits were already earned (partial delivery)
          if (currentGen && (currentGen.credits_earned ?? 0) > 0) {
            return new Response(
              JSON.stringify({ error: "Geração já recebeu créditos, cancelamento bloqueado" }),
              { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        }

        updateData.status = status;
      }

      if (workspaceName && typeof workspaceName === "string") {
        updateData.workspace_name = _sanitize(workspaceName, 200);
      }

      updateData.updated_at = new Date().toISOString();

      if (Object.keys(updateData).length > 1) {
        await supabase
          .from("generations")
          .update(updateData)
          .eq("farm_id", farmId)
          .eq("client_token_id", clientToken.id);
      }

      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // === REFUND EXPIRED/CANCELLED ===
    if (action === "refund-expired") {
      if (!farmId) {
        return new Response(
          JSON.stringify({ error: "farmId obrigatório" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: gen } = await supabase
        .from("generations")
        .select("id, credits_requested, credits_earned, status, settled_at, client_token_id")
        .eq("farm_id", farmId)
        .eq("client_token_id", clientToken.id)
        .maybeSingle();

      if (!gen || gen.settled_at) {
        return new Response(
          JSON.stringify({ success: true, already_settled: true }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // SECURITY: Block refund if generation is running or completed — only pre-running statuses can be refunded
      if (["running", "completed"].includes(gen.status)) {
        return new Response(
          JSON.stringify({ success: false, error: "Geração em andamento ou concluída, reembolso não permitido" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // SECURITY: Only allow refund for pre-running statuses
      if (!["waiting_invite", "queued", "creating", "expired", "cancelled", "error"].includes(gen.status)) {
        return new Response(
          JSON.stringify({ success: false, error: "Status inválido para reembolso" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // SECURITY: Verify with upstream API if farm actually completed before refunding
      let upstreamEarned = 0;
      const FARM_API_KEY_CHECK = Deno.env.get("FARM_API_KEY");
      if (FARM_API_KEY_CHECK && !farmId.startsWith("queued-")) {
        try {
          const statusRes = await fetch(`${API_BASE}/farm/status/${farmId}`, {
            headers: { "x-api-key": FARM_API_KEY_CHECK },
          });
          if (statusRes.ok) {
            const statusData = await statusRes.json();
            // If upstream says completed or running with credits, block refund
            if (statusData.status === "completed" || statusData.status === "running") {
              let realCredits = statusData.creditsEarned ?? statusData.result?.credits ?? 0;
              if (realCredits === 0 && Array.isArray(statusData.logs)) {
                for (const log of statusData.logs) {
                  if (log.type === "credit") {
                    const match = log.message?.match(/^\+(\d+)\s/);
                    if (match) realCredits += parseInt(match[1], 10);
                  }
                }
              }
              upstreamEarned = realCredits;
              if (statusData.status === "completed" || statusData.status === "running") {
                // Sync credits_earned to DB before deciding refund
                const capCredits = gen.credits_requested;
                const syncedEarned = Math.min(Math.max(realCredits, gen.credits_earned ?? 0), capCredits);
                await supabase.from("generations").update({ credits_earned: syncedEarned }).eq("id", gen.id);
                gen.credits_earned = syncedEarned;

                if (statusData.status === "completed" || syncedEarned >= capCredits) {
                  return new Response(
                    JSON.stringify({ success: false, error: "Geração já concluída na API, reembolso bloqueado" }),
                    { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                  );
                }
              }
            }
          }
        } catch {
          // API unreachable — proceed with DB data only for pre-running statuses
        }
      }

      const earned = Math.max(gen.credits_earned ?? 0, upstreamEarned);
      const requested = gen.credits_requested;
      const refundCredits = requested - earned;

      const refundStatus = (status && ALLOWED_STATUS_VALUES.includes(status)) ? status : "expired";

      const { data: updated } = await supabase
        .from("generations")
        .update({
          status: refundStatus,
          settled_at: new Date().toISOString(),
          credits_earned: earned,
        })
        .eq("id", gen.id)
        .is("settled_at", null)
        .select("id")
        .maybeSingle();

      if (!updated) {
        return new Response(
          JSON.stringify({ success: true, already_settled: true }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (refundCredits > 0) {
        const { error: refundError } = await supabase.rpc("refund_client_token_credits", {
          p_token_id: clientToken.id,
          p_credits: refundCredits,
        });

        if (refundError) {
          console.error(`[client-generate] Refund failed:`, refundError);
          await supabase.from("generations").update({ settled_at: null, status: gen.status }).eq("id", gen.id);
          throw new Error("Falha ao reembolsar créditos");
        }

        console.log(`[client-generate] Refunded ${refundCredits} credits to token ${clientToken.id} (${earned}/${requested} delivered)`);
      }

      const { data: updatedToken } = await supabase
        .from("client_tokens")
        .select("credits_used, total_credits")
        .eq("id", clientToken.id)
        .single();

      return new Response(
        JSON.stringify({
          success: true,
          refunded: refundCredits,
          remaining: updatedToken ? updatedToken.total_credits - updatedToken.credits_used : remaining,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // === CREATE ===
    if (action === "create") {
      if (!credits || typeof credits !== "number" || credits < 5 || credits % 5 !== 0) {
        return new Response(
          JSON.stringify({ error: "Créditos inválidos" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { realRemaining, hasActiveGen } = await getRealRemaining();

      if (hasActiveGen) {
        return new Response(
          JSON.stringify({ error: "Você já tem uma geração ativa. Aguarde ela finalizar antes de iniciar outra." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (realRemaining <= 0) {
        return new Response(
          JSON.stringify({ error: "Créditos esgotados" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const actualCredits = Math.min(credits, realRemaining);

      const { data: useResult, error: useError } = await supabase.rpc("use_client_token_credits", {
        p_token_id: clientToken.id,
        p_credits: actualCredits,
      });

      if (useError) throw new Error(useError.message);
      if (!useResult?.success) {
        return new Response(
          JSON.stringify({ error: useResult?.error || "Falha ao reservar créditos" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check active generation count (with ghost filtering)
      const activeCount = await getActiveGenerationCount(supabase);

      if (activeCount >= MAX_CONCURRENT) {
        // QUEUE: insert with placeholder farm_id
        const placeholderFarmId = `queued-${crypto.randomUUID()}`;
        const { data: insertedGen } = await supabase
          .from("generations")
          .insert({
            farm_id: placeholderFarmId,
            client_name: `client-link-${clientToken.id.slice(0, 8)}`,
            credits_requested: actualCredits,
            status: "queued",
            client_token_id: clientToken.id,
            client_ip: clientIp,
          })
          .select("id")
          .single();

        const queuePosition = insertedGen ? await getQueuePosition(supabase, insertedGen.id) : 1;

        console.log(`[client-generate] Queued: generationId=${insertedGen?.id}, position=${queuePosition}, credits=${actualCredits}`);

        return new Response(
          JSON.stringify({
            success: true,
            queued: true,
            queuePosition,
            generationId: insertedGen?.id,
            credits: actualCredits,
            remaining: useResult.remaining,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // NOT QUEUED: create farm immediately
      let farmData: any;
      try {
        const farmRes = await fetch(`${API_BASE}/farm/create`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-api-key": FARM_API_KEY },
          body: JSON.stringify({ credits: actualCredits, slavesCount: Math.ceil(actualCredits / 5) }),
        });

        if (!farmRes.ok) {
          const errBody = await farmRes.text();
          throw new Error(errBody || "Farm API error");
        }

        farmData = await farmRes.json();
      } catch (farmErr) {
        await supabase.rpc("refund_client_token_credits", {
          p_token_id: clientToken.id,
          p_credits: actualCredits,
        });
        throw farmErr;
      }

      await supabase.from("generations").insert({
        farm_id: farmData.farmId,
        client_name: `client-link-${clientToken.id.slice(0, 8)}`,
        credits_requested: actualCredits,
        status: farmData.queued ? "queued" : "waiting_invite",
        master_email: farmData.masterEmail,
        client_token_id: clientToken.id,
      });

      console.log(`[client-generate] Farm created: ${farmData.farmId} for client token ${clientToken.id}, ${actualCredits} credits`);

      return new Response(
        JSON.stringify({
          success: true,
          farmId: farmData.farmId,
          masterEmail: farmData.masterEmail,
          credits: actualCredits,
          queued: farmData.queued || false,
          queuePosition: farmData.queuePosition,
          remaining: useResult.remaining,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Ação inválida. Use: validate, create, check-queue, update-status, refund-expired" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[client-generate] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  let _enc = false; let _rq = req;
  try { const _t = await req.clone().text(); if (_t) { const _j = JSON.parse(_t); if (_j?._p) { _enc = true; _rq = new Request(req.url, { method: req.method, headers: req.headers, body: JSON.stringify(_dc(_j._p)) }); } } } catch {}
  const _rs = await _handler(_rq);
  if (!_enc) return _rs;
  try { if (_rs.headers.get("content-type")?.includes("json")) { const _b = await _rs.json(); return new Response(JSON.stringify({ _r: _ec(_b) }), { status: _rs.status, headers: _rs.headers }); } } catch {}
  return _rs;
});
