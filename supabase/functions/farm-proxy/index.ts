import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const API_BASE = "https://api.lovablextensao.shop";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const FARM_API_KEY = Deno.env.get("FARM_API_KEY");
  if (!FARM_API_KEY) {
    return new Response(
      JSON.stringify({ error: "FARM_API_KEY not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action");
    const farmId = url.searchParams.get("farmId");

    // SSE streaming endpoint
    if (action === "events" && farmId) {
      const upstreamUrl = `${API_BASE}/farm/events/${farmId}?apiKey=${FARM_API_KEY}`;
      const upstreamRes = await fetch(upstreamUrl);

      if (!upstreamRes.ok) {
        const errBody = await upstreamRes.text();
        return new Response(
          JSON.stringify({ error: `Upstream error: ${upstreamRes.status}`, details: errBody }),
          { status: upstreamRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Stream SSE back to client
      const { readable, writable } = new TransformStream();
      const writer = writable.getWriter();
      const reader = upstreamRes.body!.getReader();
      const encoder = new TextEncoder();

      (async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            await writer.write(value);
          }
        } catch (e) {
          console.error("SSE stream error:", e);
        } finally {
          try { writer.close(); } catch {}
        }
      })();

      return new Response(readable, {
        headers: {
          ...corsHeaders,
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
        },
      });
    }

    // Regular API proxy endpoints
    let upstreamUrl: string;
    let method = "GET";
    let body: string | undefined;

    switch (action) {
      case "stock":
        upstreamUrl = `${API_BASE}/farm/stock`;
        break;

      case "create": {
        upstreamUrl = `${API_BASE}/farm/create`;
        method = "POST";
        body = await req.text();
        break;
      }

      case "status": {
        if (!farmId) {
          return new Response(
            JSON.stringify({ error: "farmId is required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        upstreamUrl = `${API_BASE}/farm/status/${farmId}`;
        break;
      }

      case "cancel": {
        if (!farmId) {
          return new Response(
            JSON.stringify({ error: "farmId is required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        upstreamUrl = `${API_BASE}/farm/cancel/${farmId}`;
        method = "POST";
        break;
      }

      default:
        return new Response(
          JSON.stringify({ error: "Invalid action. Use: stock, create, status, cancel, events" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    const headers: Record<string, string> = {
      "x-api-key": FARM_API_KEY,
      "Content-Type": "application/json",
    };

    console.log(`[farm-proxy] ${method} ${upstreamUrl}`);

    const upstreamRes = await fetch(upstreamUrl, {
      method,
      headers,
      body: method === "POST" ? body : undefined,
    });

    const data = await upstreamRes.text();
    console.log(`[farm-proxy] upstream responded: ${upstreamRes.status}`);

    return new Response(data, {
      status: upstreamRes.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[farm-proxy] error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
