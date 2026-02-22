import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const resendApiKey = Deno.env.get("RESEND_API_KEY_2") || Deno.env.get("RESEND_API_KEY");

  if (!resendApiKey) {
    return new Response(JSON.stringify({ error: "RESEND_API_KEY not configured" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Auth check - admin only
  const authHeader = req.headers.get("authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({ error: "Not authenticated" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: user.id, _role: "admin" });
  if (!isAdmin) {
    return new Response(JSON.stringify({ error: "Admin only" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const skip = body.skip || 0; // Skip first N users (already sent)

    // Paginate through ALL users
    const emails: string[] = [];
    let page = 1;
    const perPage = 1000;
    while (true) {
      const { data: result, error: listError } = await supabase.auth.admin.listUsers({ page, perPage });
      if (listError) throw new Error(`Failed to list users page ${page}: ${listError.message}`);
      for (const u of result.users) {
        if (u.email) emails.push(u.email);
      }
      if (result.users.length < perPage) break;
      page++;
    }

    // Skip already-sent users
    const toSend = emails.slice(skip);

    if (toSend.length === 0) {
      return new Response(JSON.stringify({ error: "No remaining users to send" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0a0a;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color:#111;border-radius:16px;overflow:hidden;border:1px solid #222;">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#7c3aed,#a855f7);padding:40px 30px;text-align:center;">
              <h1 style="color:#fff;font-size:28px;margin:0 0 8px;">🚀 O Painel Está de Volta!</h1>
              <p style="color:rgba(255,255,255,0.85);font-size:16px;margin:0;">Gerações ativas novamente</p>
            </td>
          </tr>
          
          <!-- Body -->
          <tr>
            <td style="padding:40px 30px;">
              <p style="color:#e5e5e5;font-size:16px;line-height:1.6;margin:0 0 20px;">
                Boas notícias! O <strong style="color:#a855f7;">LovablePainel</strong> está funcionando perfeitamente e as gerações de créditos estão ativas novamente.
              </p>
              
              <p style="color:#e5e5e5;font-size:16px;line-height:1.6;margin:0 0 30px;">
                Não perca tempo — acesse agora e gere seus créditos Lovable com o melhor custo-benefício do mercado.
              </p>
              
              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding:10px 0 30px;">
                    <a href="https://lovablepainel.com" target="_blank" style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#a855f7);color:#fff;font-size:18px;font-weight:700;text-decoration:none;padding:16px 48px;border-radius:12px;letter-spacing:0.5px;">
                      ACESSAR AGORA →
                    </a>
                  </td>
                </tr>
              </table>
              
              <div style="border-top:1px solid #222;padding-top:20px;margin-top:10px;">
                <p style="color:#888;font-size:13px;line-height:1.5;margin:0;">
                  ✅ Pague por demanda — sem planos fixos<br>
                  ✅ Geração instantânea via PIX<br>
                  ✅ Quanto mais gera, menor o preço
                </p>
              </div>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color:#0a0a0a;padding:20px 30px;text-align:center;border-top:1px solid #222;">
              <p style="color:#555;font-size:12px;margin:0;">
                © 2026 LovablePainel • <a href="https://lovablepainel.com" style="color:#7c3aed;text-decoration:none;">lovablepainel.com</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    // Send via Resend - batch using BCC
    const batchSize = 50;
    let sent = 0;
    const errors: string[] = [];

    for (let i = 0; i < toSend.length; i += batchSize) {
      const batch = toSend.slice(i, i + batchSize);
      
      // Wait 1.5s between batches to respect Resend rate limit (2 req/s)
      if (i > 0) {
        await new Promise(r => setTimeout(r, 1500));
      }
      
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "LovablePainel <noreply@lovablepainel.com>",
          to: batch,
          subject: "🚀 O Painel Está de Volta! Gerações Ativas Novamente",
          html: htmlContent,
        }),
      });

      if (res.ok) {
        sent += batch.length;
      } else {
        const err = await res.text();
        errors.push(`Batch ${i}: ${err}`);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      total_users: emails.length,
      skipped: skip,
      to_send: toSend.length,
      sent,
      errors: errors.length > 0 ? errors : undefined,
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[send-announcement] Error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
