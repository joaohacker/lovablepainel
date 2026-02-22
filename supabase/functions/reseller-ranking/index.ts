import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function maskEmail(email: string): string {
  const local = email.split("@")[0] || "user";
  const clean = local.replace(/[^a-zA-Z]/g, "");
  if (clean.length < 2) return "User***";
  const shown = clean.slice(0, 5);
  return shown.charAt(0).toUpperCase() + shown.slice(1).toLowerCase() + "...";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // 1. Get banned user IDs
    const { data: banned } = await supabase.from("banned_users").select("user_id");
    const bannedIds = new Set((banned || []).map((b) => b.user_id));

    // 2. Get admin user IDs to exclude
    const { data: admins } = await supabase.from("user_roles").select("user_id").eq("role", "admin");
    const adminIds = new Set((admins || []).map((a) => a.user_id));

    // 3. Get wallets with negative balance (bug users)
    const { data: negWallets } = await supabase
      .from("wallets")
      .select("user_id")
      .lt("balance", 0);
    const negBalanceIds = new Set((negWallets || []).map((w) => w.user_id));

    // 4. Get all completed/running generations with credits_earned, grouped by user_id
    // These are credits actually delivered
    const { data: gens, error: genErr } = await supabase
      .from("generations")
      .select("user_id, credits_earned")
      .not("user_id", "is", null)
      .gt("credits_earned", 0)
      .in("status", ["completed", "running"]);

    if (genErr) throw genErr;

    // Aggregate credits_earned per user
    const userCredits = new Map<string, number>();
    for (const g of gens || []) {
      if (!g.user_id) continue;
      userCredits.set(g.user_id, (userCredits.get(g.user_id) || 0) + (g.credits_earned || 0));
    }

    // 5. Filter out banned, admin, negative balance, and low-credit users
    const filtered: { userId: string; credits: number }[] = [];
    for (const [userId, credits] of userCredits) {
      if (bannedIds.has(userId) || adminIds.has(userId) || negBalanceIds.has(userId)) continue;
      if (credits < 50) continue;
      filtered.push({ userId, credits });
    }

    filtered.sort((a, b) => b.credits - a.credits);
    const top = filtered.slice(0, 20);

    if (top.length === 0) {
      return new Response(JSON.stringify({ ranking: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 6. Get emails from auth.users
    const { data: { users } } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    const emailMap = new Map<string, string>();
    for (const u of users || []) {
      emailMap.set(u.id, u.email || "");
    }

    const ranking = top.map((entry, i) => ({
      position: i + 1,
      name: maskEmail(emailMap.get(entry.userId) || "user"),
      credits: entry.credits,
    }));

    return new Response(JSON.stringify({ ranking }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[reseller-ranking] Error:", error);
    return new Response(JSON.stringify({ error: "Erro ao carregar ranking" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
