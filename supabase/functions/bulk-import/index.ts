import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function parseCSV(csv: string): Record<string, any>[] {
  const lines = csv.trim().split("\n");
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map(h => h.trim());
  const rows: Record<string, any>[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    
    // Simple CSV parse handling quoted fields
    const values: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let j = 0; j < line.length; j++) {
      const ch = line[j];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        values.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    values.push(current.trim());
    
    const row: Record<string, any> = {};
    for (let j = 0; j < headers.length; j++) {
      const val = values[j] ?? "";
      if (val === "" || val === "null" || val === "NULL") {
        row[headers[j]] = null;
      } else if (val === "true") {
        row[headers[j]] = true;
      } else if (val === "false") {
        row[headers[j]] = false;
      } else {
        row[headers[j]] = val;
      }
    }
    rows.push(row);
  }
  return rows;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const { table, rows, csv } = await req.json();
    
    let data: Record<string, any>[];
    if (csv) {
      data = parseCSV(csv);
    } else if (rows && Array.isArray(rows)) {
      data = rows;
    } else {
      return new Response(JSON.stringify({ error: "rows or csv required" }), { 
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    if (!table || data.length === 0) {
      return new Response(JSON.stringify({ error: "table and data required", parsed: data.length }), { 
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    // Insert in batches of 500
    const batchSize = 500;
    let inserted = 0;
    const errors: string[] = [];

    for (let i = 0; i < data.length; i += batchSize) {
      const batch = data.slice(i, i + batchSize);
      const { error } = await supabase.from(table).upsert(batch, { onConflict: "id", ignoreDuplicates: true });
      if (error) {
        errors.push(`Batch ${i}-${i + batch.length}: ${error.message}`);
      } else {
        inserted += batch.length;
      }
    }

    return new Response(
      JSON.stringify({ success: true, inserted, total: data.length, errors }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
