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

/** Paginate to get ALL rows, bypassing the 1000-row default limit */
async function fetchAllGenerations(supabase: ReturnType<typeof createClient>) {
  const PAGE = 1000;
  let offset = 0;
  const all: { user_id: string; credits_earned: number }[] = [];

  while (true) {
    const { data, error } = await supabase
      .from("generations")
      .select("user_id, credits_earned")
      .not("user_id", "is", null)
      .gt("credits_earned", 0)
      .in("status", ["completed", "running"])
      .range(offset, offset + PAGE - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Parallel: fetch exclusion lists + generations
    const [bannedRes, adminsRes, negRes, gens] = await Promise.all([
      supabase.from("banned_users").select("user_id"),
      supabase.from("user_roles").select("user_id").eq("role", "admin"),
      supabase.from("wallets").select("user_id").lt("balance", 0),
      fetchAllGenerations(supabase),
    ]);

    const bannedIds = new Set((bannedRes.data || []).map((b) => b.user_id));
    const adminIds = new Set((adminsRes.data || []).map((a) => a.user_id));
    const negBalanceIds = new Set((negRes.data || []).map((w) => w.user_id));

    // Aggregate credits_earned per user
    const userCredits = new Map<string, number>();
    for (const g of gens) {
      if (!g.user_id) continue;
      userCredits.set(g.user_id, (userCredits.get(g.user_id) || 0) + (g.credits_earned || 0));
    }

    // Filter
    const filtered: { userId: string; credits: number }[] = [];
    for (const [userId, credits] of userCredits) {
      if (bannedIds.has(userId) || adminIds.has(userId) || negBalanceIds.has(userId)) continue;
      if (credits < 50) continue;
      filtered.push({ userId, credits });
    }

    filtered.sort((a, b) => b.credits - a.credits);
    const top = filtered.slice(0, 10);

    if (top.length === 0) {
      return new Response(JSON.stringify({ ranking: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get emails
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
