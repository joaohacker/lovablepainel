// Payload obfuscation codec — makes request/response bodies unreadable in DevTools Network tab
// This is NOT cryptographic security — it's an obscurity layer to prevent casual inspection

export function encodePayload(data: any): string {
  const json = JSON.stringify(data);
  const b64 = btoa(unescape(encodeURIComponent(json)));
  // Reverse and swap adjacent pairs to make it non-trivially decodable
  const arr = b64.split('').reverse();
  for (let i = 0; i < arr.length - 1; i += 2) {
    const tmp = arr[i];
    arr[i] = arr[i + 1];
    arr[i + 1] = tmp;
  }
  return arr.join('');
}

export function decodePayload(encoded: string): any {
  const arr = encoded.split('');
  for (let i = 0; i < arr.length - 1; i += 2) {
    const tmp = arr[i];
    arr[i] = arr[i + 1];
    arr[i + 1] = tmp;
  }
  const b64 = arr.reverse().join('');
  return JSON.parse(decodeURIComponent(escape(atob(b64))));
}

// Helper for direct fetch calls (not supabase.functions.invoke)
export function encodeBody(data: any): string {
  return JSON.stringify({ _p: encodePayload(data) });
}

export function decodeResponse(data: any): any {
  if (data && data._r) {
    try {
      return decodePayload(data._r);
    } catch {}
  }
  return data;
}
