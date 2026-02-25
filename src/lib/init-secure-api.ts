// Auto-patches supabase.functions.invoke to encode/decode payloads
// Import this ONCE in main.tsx before App renders
// Edge functions transparently handle both encoded and plain payloads

import { supabase } from "@/integrations/supabase/client";
import { encodePayload, decodePayload } from "./api-codec";

const _origInvoke = supabase.functions.invoke.bind(supabase.functions);

(supabase.functions as any).invoke = async function (
  functionName: string,
  options?: { body?: any; headers?: Record<string, string>; [k: string]: any }
) {
  const body = options?.body;
  const encodedOptions = body
    ? { ...options, body: { _p: encodePayload(body) } }
    : options;

  const result = await _origInvoke(functionName, encodedOptions);

  if (result.data?._r) {
    try {
      result.data = decodePayload(result.data._r);
    } catch {
      // If decode fails, return raw data
    }
  }

  return result;
};
