import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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
- "Têm acesso ao meu projeto?" → Não. O membro é temporário e removido após geração.
- "Reembolso?" → Falhas voltam pro saldo automaticamente. Reembolso em dinheiro → suporte.

🎯 ESTILO
- Curta, amigável, 1-2 emojis por mensagem
- Frustrado? Empatia primeiro, solução depois
- Nunca culpe o usuário
- Se o usuário acessou via TOKEN (link de cliente/revendedor): NUNCA forneça número de WhatsApp. Diga: "Entre em contato com quem te vendeu o acesso para suporte humano."
- Se o usuário acessou pelo painel principal (logado com email): "Fale com nosso suporte: https://wa.me/5521992046054"`;

// Simple in-memory rate limiter for luna-chat (per-isolate)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 20; // max 20 requests per 60 seconds per IP
const RATE_WINDOW = 60_000;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW });
    return true;
  }
  entry.count++;
  return entry.count <= RATE_LIMIT;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // SECURITY: Rate limit by IP
    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    if (!checkRateLimit(clientIp)) {
      return new Response(JSON.stringify({ error: "Muitas solicitações. Aguarde um minuto." }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const { messages } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: "messages array is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
          ...messages,
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
});
