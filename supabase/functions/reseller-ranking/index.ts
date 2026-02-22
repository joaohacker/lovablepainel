import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Mask email to a readable pseudo-name.
 * "joaosilva@gmail.com" → "Joaos..."
 * "maria123@hotmail.com" → "Maria..."
 */
function maskEmail(email: string): string {
  const local = email.split("@")[0] || "user";
  // Remove numbers and special chars to get "name-like" prefix
  const clean = local.replace(/[^a-zA-Z]/g, "");
  if (clean.length < 2) return "User***";
  // Capitalize first letter, show first 5 chars max
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
    // 1. Get all client_tokens grouped by owner_id with total credits
    const { data: tokens, error: tokErr } = await supabase
      .from("client_tokens")
      .select("owner_id, total_credits");

    if (tokErr) throw tokErr;
    if (!tokens || tokens.length === 0) {
      return new Response(JSON.stringify({ ranking: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Aggregate total_credits per owner
    const ownerCredits = new Map<string, number>();
    for (const t of tokens) {
      ownerCredits.set(t.owner_id, (ownerCredits.get(t.owner_id) || 0) + t.total_credits);
    }

    // 2. Get banned user IDs to exclude
    const { data: banned } = await supabase.from("banned_users").select("user_id");
    const bannedIds = new Set((banned || []).map((b) => b.user_id));

    // 3. Get admin user IDs to exclude
    const { data: admins } = await supabase.from("user_roles").select("user_id").eq("role", "admin");
    const adminIds = new Set((admins || []).map((a) => a.user_id));

    // Filter out banned and admin users, and those with < 100 credits (noise)
    const filtered: { userId: string; credits: number }[] = [];
    for (const [userId, credits] of ownerCredits) {
      if (bannedIds.has(userId) || adminIds.has(userId)) continue;
      if (credits < 100) continue;
      filtered.push({ userId, credits });
    }

    // Sort descending
    filtered.sort((a, b) => b.credits - a.credits);
    const top = filtered.slice(0, 20);

    if (top.length === 0) {
      return new Response(JSON.stringify({ ranking: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 4. Get emails from auth.users
    const userIds = top.map((t) => t.userId);
    const { data: { users } } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    const emailMap = new Map<string, string>();
    for (const u of users || []) {
      emailMap.set(u.id, u.email || "");
    }

    // 5. Build ranking with masked names
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
