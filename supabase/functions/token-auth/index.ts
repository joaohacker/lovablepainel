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
    // Check if IP is banned
    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const { data: isIpBanned } = await supabase.rpc("is_ip_banned", { p_ip: clientIp });
    if (isIpBanned) {
      return new Response(
        JSON.stringify({ success: false, error: "⛔ Acesso bloqueado." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { action, token, email, password, username } = await req.json();

    if (!token) {
      return new Response(
        JSON.stringify({ success: false, error: "Token é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!["check", "reset-account"].includes(action) && (!email || !password)) {
      return new Response(
        JSON.stringify({ success: false, error: "Email e senha são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate token exists
    const { data: tokenData, error: tokenErr } = await supabase
      .from("tokens")
      .select("id, client_name")
      .eq("token", token)
      .single();

    if (tokenErr || !tokenData) {
      return new Response(
        JSON.stringify({ success: false, error: "Token inválido" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if token has an account (no email/password needed)
    if (action === "check") {
      const { data: existing } = await supabase
        .from("token_accounts")
        .select("id")
        .eq("token_id", tokenData.id)
        .maybeSingle();

      return new Response(
        JSON.stringify({ success: true, has_account: !!existing }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Password strength validation (server-side) - only for signup/login
    if (["signup", "login"].includes(action)) {
      if (password.length < 8) {
        return new Response(
          JSON.stringify({ success: false, error: "Senha deve ter no mínimo 8 caracteres" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (!/[A-Z]/.test(password)) {
        return new Response(
          JSON.stringify({ success: false, error: "Senha deve conter pelo menos uma letra maiúscula" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (!/[0-9]/.test(password)) {
        return new Response(
          JSON.stringify({ success: false, error: "Senha deve conter pelo menos um número" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (!/[^A-Za-z0-9]/.test(password)) {
        return new Response(
          JSON.stringify({ success: false, error: "Senha deve conter pelo menos um caractere especial (!@#$...)" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    if (action === "signup") {
      // Check if token already has an account
      const { data: existing } = await supabase
        .from("token_accounts")
        .select("id")
        .eq("token_id", tokenData.id)
        .maybeSingle();

      if (existing) {
        return new Response(
          JSON.stringify({ success: false, error: "Este token já possui uma conta registrada. Faça login." }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Validate username
      const trimmedUsername = (username || "").trim();
      if (!trimmedUsername || trimmedUsername.length < 2) {
        return new Response(
          JSON.stringify({ success: false, error: "Nome de usuário deve ter pelo menos 2 caracteres" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Create auth user (auto-confirm since no email verification needed for token users)
      const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { token_id: tokenData.id, client_name: trimmedUsername },
      });

      if (authErr) {
        const msg = authErr.message.includes("already been registered")
          ? "Este email já está em uso"
          : authErr.message;
        return new Response(
          JSON.stringify({ success: false, error: msg }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Link user to token and update client_name
      const { error: linkErr } = await supabase.from("token_accounts").insert({
        token_id: tokenData.id,
        user_id: authData.user.id,
        email,
      });

      // Update token client_name with the username
      await supabase.from("tokens").update({ client_name: trimmedUsername }).eq("id", tokenData.id);

      if (linkErr) {
        // Rollback: delete the auth user
        await supabase.auth.admin.deleteUser(authData.user.id);
        return new Response(
          JSON.stringify({ success: false, error: "Erro ao vincular conta ao token. Tente novamente." }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, message: "Conta criada com sucesso! Faça login." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "login") {
      // Check if this token has an account and it matches the email
      const { data: account } = await supabase
        .from("token_accounts")
        .select("user_id, email")
        .eq("token_id", tokenData.id)
        .maybeSingle();

      if (!account) {
        return new Response(
          JSON.stringify({ success: false, error: "Nenhuma conta registrada para este token. Crie uma conta primeiro." }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (account.email.toLowerCase() !== email.toLowerCase()) {
        return new Response(
          JSON.stringify({ success: false, error: "Email não corresponde à conta deste token" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Verify credentials using signInWithPassword via anon client
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
      const anonClient = createClient(supabaseUrl, anonKey);
      const { data: signInData, error: signInErr } = await anonClient.auth.signInWithPassword({
        email,
        password,
      });

      if (signInErr) {
        return new Response(
          JSON.stringify({ success: false, error: "Email ou senha incorretos" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          session: signInData.session,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "reset-account") {
      // SECURITY: Require admin authentication
      const authHeader = req.headers.get("authorization");
      if (!authHeader) {
        return new Response(
          JSON.stringify({ success: false, error: "Autenticação necessária" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user: adminUser } } = await userClient.auth.getUser();
      if (!adminUser) {
        return new Response(
          JSON.stringify({ success: false, error: "Usuário inválido" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const { data: roleCheck } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", adminUser.id)
        .eq("role", "admin")
        .maybeSingle();
      if (!roleCheck) {
        return new Response(
          JSON.stringify({ success: false, error: "Apenas administradores podem resetar contas" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: account } = await supabase
        .from("token_accounts")
        .select("user_id, email")
        .eq("token_id", tokenData.id)
        .maybeSingle();

      if (!account) {
        return new Response(
          JSON.stringify({ success: false, error: "Nenhuma conta vinculada a este token" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Delete token_account link
      await supabase.from("token_accounts").delete().eq("token_id", tokenData.id);

      // Delete auth user
      await supabase.auth.admin.deleteUser(account.user_id);

      return new Response(
        JSON.stringify({ success: true, message: "Conta resetada. Token liberado para novo cadastro.", deleted_email: account.email }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: "Ação inválida" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[token-auth] error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
