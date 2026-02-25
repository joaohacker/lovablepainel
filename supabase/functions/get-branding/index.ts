import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const { token } = await req.json();

    if (!token) {
      return new Response(JSON.stringify({ error: "Token obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find the client_token and its owner
    const { data: clientToken, error: tokErr } = await supabase
      .from("client_tokens")
      .select("owner_id")
      .eq("token", token)
      .maybeSingle();

    if (tokErr || !clientToken) {
      return new Response(JSON.stringify({ brand_name: null, brand_logo_url: null }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get the owner's branding from profiles
    const { data: profile } = await supabase
      .from("profiles")
      .select("brand_name, brand_logo_url, brand_color")
      .eq("user_id", clientToken.owner_id)
      .single();

    return new Response(
      JSON.stringify({
        brand_name: profile?.brand_name || null,
        brand_logo_url: profile?.brand_logo_url || null,
        brand_color: profile?.brand_color || null,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
