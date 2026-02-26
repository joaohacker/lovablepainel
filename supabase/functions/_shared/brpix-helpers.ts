/**
 * Shared BrPix payment verification helpers.
 * Centralizes all payment status parsing to avoid inconsistencies.
 */

export const BRPIX_BASE = "https://finance.brpixpayments.com/api";

/**
 * Deeply searches a BrPix API response object for payment confirmation signals.
 * BrPix may return data in different structures depending on the endpoint/version.
 * This function checks ALL known locations.
 */
export function isBrPixPaid(data: Record<string, unknown>): boolean {
  if (!data || typeof data !== "object") return false;

  // Check all possible nested objects where status/paid might live
  const candidates: Record<string, unknown>[] = [data];
  for (const key of ["data", "payment", "transaction", "pix", "charge", "result"]) {
    const nested = data[key];
    if (nested && typeof nested === "object" && !Array.isArray(nested)) {
      candidates.push(nested as Record<string, unknown>);
    }
  }

  for (const obj of candidates) {
    // Boolean paid flag
    if (obj.paid === true) return true;

    // paid_at timestamp present
    if (obj.paid_at || obj.paidAt || obj.paid_date) return true;

    // Status string matches
    const status = String(obj.status || "").toLowerCase();
    if (["paid", "completed", "approved", "confirmed", "settled"].includes(status)) return true;

    // payment_status field (some APIs use this)
    const paymentStatus = String(obj.payment_status || obj.paymentStatus || "").toLowerCase();
    if (["paid", "completed", "approved", "confirmed", "settled"].includes(paymentStatus)) return true;
  }

  return false;
}

/**
 * Extracts the paid amount from a BrPix response, searching multiple possible locations.
 */
export function extractBrPixAmount(data: Record<string, unknown>): number {
  if (!data || typeof data !== "object") return 0;

  const candidates: Record<string, unknown>[] = [data];
  for (const key of ["data", "payment", "transaction", "pix", "charge", "result"]) {
    const nested = data[key];
    if (nested && typeof nested === "object" && !Array.isArray(nested)) {
      candidates.push(nested as Record<string, unknown>);
    }
  }

  for (const obj of candidates) {
    for (const field of ["amount", "value", "total", "paid_amount", "paidAmount"]) {
      const val = Number(obj[field]);
      if (val > 0) return val;
    }
  }

  return 0;
}

/**
 * Verifies a payment with BrPix API and returns parsed result.
 */
export async function verifyBrPixPayment(
  transactionId: string,
  apiKey: string
): Promise<{ paid: boolean; amount: number; rawData: Record<string, unknown> | null; error?: string }> {
  try {
    const res = await fetch(`${BRPIX_BASE}/payments/${transactionId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!res.ok) {
      return { paid: false, amount: 0, rawData: null, error: `HTTP ${res.status}` };
    }

    const rawData = await res.json();
    const paid = isBrPixPaid(rawData);
    const amount = extractBrPixAmount(rawData);

    return { paid, amount, rawData };
  } catch (err) {
    return { paid: false, amount: 0, rawData: null, error: String(err) };
  }
}
