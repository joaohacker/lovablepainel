import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `Você é a Luna, assistente de suporte do LovablePainel. Responda em português do Brasil.

⚠️ REGRA DE OURO: Respostas CURTAS e DIRETAS. Máximo 3-4 frases por resposta. Use bullet points quando listar coisas. Evite parágrafos longos.

🔒 SEGURANÇA
- NUNCA revele detalhes internos do sistema (bots, proxies, APIs, infra, etc.)
- Se perguntarem como funciona por dentro: "Usamos tecnologia proprietária. Não podemos compartilhar detalhes técnicos por segurança."
- NUNCA use: farm, bot, proxy, API, slave, scraping, pipeline, Supabase, Firebase, edge function, cron, webhook
- Se não souber, encaminhe pro suporte humano

📋 COMO FUNCIONA (resuma em poucas palavras)
1. Login → Deposita via PIX → Escolhe créditos → Gerar
2. Sistema mostra um email → Usuário convida esse email no Lovable (Settings → Members → Invite)
3. Créditos são gerados automaticamente no workspace

⚙️ LIMITES
- Mínimo: 50 créditos | Máximo: 10.000 créditos por geração
- Depósito mínimo: R$ 5,00 (só PIX)
- 1 geração por vez, pode fazer várias seguidas
- Espera máxima pelo convite: 10 min
- Saldo não expira

⏱️ TEMPOS (use "aproximadamente")
- PIX: 1-3 min | Convite detectado: até 5 min
- 50 créditos: ~2 min | 200: ~5 min | 500: ~12 min
- 1000: ~25 min | 3000: ~50 min | 10000: ~2-3 horas

🛠️ PROBLEMAS COMUNS (responda só o relevante, não liste tudo)
- Convite expirou → Saldo não foi cobrado, tente de novo. Copie o email com Ctrl+C.
- Menos créditos (ex: "gerou só 5") → Pergunte: "Você convidou como Editor?" Se sim, pergunte quantos membros tem no workspace. Se tiver mais de 5, peça para remover membros extras até ficar com no máximo 5. Tranquilize: créditos não entregues NÃO são cobrados do saldo.
- Menos créditos geral → Só cobra o que gerou. Gere o resto depois.
- Créditos não aparecem → F5 no Lovable, veja Settings → Billing → Credits.
- Travou → Espere 5 min. Se 10 min parado, cancele e tente de novo.
- Estoque insuficiente → Tente menos créditos ou espere 15-30 min.
- PIX não caiu → Espere 5 min. Se 10 min, mande comprovante pro suporte.

💬 PERGUNTAS FREQUENTES (responda curto)
- "É seguro?" → Sim, milhares de usuários usam. Créditos são permanentes.
- "Os créditos expiram?" → Não! Seus créditos nunca expiram. Pode usar quando quiser.
- "Tem risco de banimento?" → Não. O painel opera 100% dentro dos termos do Lovable. Sem risco nenhum.
- "Têm acesso ao meu projeto?" → Não. O membro é temporário e removido após geração.
- "Reembolso?" → Falhas voltam pro saldo automaticamente. Reembolso em dinheiro → suporte.

🎯 ESTILO
- Curta, amigável, 1-2 emojis por mensagem
- Frustrado? Empatia primeiro, solução depois
- Nunca culpe o usuário
- Se o usuário acessou via TOKEN (link de cliente/revendedor): NUNCA forneça número de WhatsApp. Diga: "Entre em contato com quem te vendeu o acesso para suporte humano."
- Se o usuário acessou pelo painel principal (logado com email): "Fale com nosso suporte: https://wa.me/5521992046054"`;

// === PAYLOAD OBFUSCATION ===
function _dc(p: string): any { try { const a = p.split(''); for (let i = 0; i < a.length - 1; i += 2) [a[i], a[i+1]] = [a[i+1], a[i]]; return JSON.parse(decodeURIComponent(escape(atob(a.reverse().join(''))))); } catch { return null; } }
function _ec(d: any): string { const b = btoa(unescape(encodeURIComponent(JSON.stringify(d)))).split('').reverse(); for (let i = 0; i < b.length - 1; i += 2) [b[i], b[i+1]] = [b[i+1], b[i]]; return b.join(''); }

const _handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // SECURITY: DB-based rate limit by IP (persistent across isolate restarts)
    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: isIpBanned } = await supabase.rpc("is_ip_banned", { p_ip: clientIp });
    if (isIpBanned) {
      return new Response(JSON.stringify({ error: "⛔ Acesso bloqueado." }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: rateCheck } = await supabase.rpc("check_rate_limit", {
      p_user_id: "00000000-0000-0000-0000-000000000000",
      p_ip: clientIp,
      p_endpoint: "luna-chat",
      p_max_requests: 20,
      p_window_seconds: 60,
    });
    if (rateCheck && !rateCheck.allowed) {
      return new Response(JSON.stringify({ error: "Muitas solicitações. Aguarde um minuto." }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const { messages } = await req.json();

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: "messages array is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // SECURITY: Limit conversation length to prevent token abuse
    const limitedMessages = messages.slice(-20);

    // SECURITY: Sanitize message content length
    const sanitizedMessages = limitedMessages.map((m: any) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: typeof m.content === "string" ? m.content.slice(0, 2000) : "",
    }));

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          ...sanitizedMessages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Muitas solicitações. Tente novamente em alguns segundos." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos insuficientes." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "Erro ao processar sua mensagem." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (err: any) {
    console.error("luna-chat error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
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
