import { useState, useCallback } from "react";
import type { User } from "@supabase/supabase-js";

interface Wallet {
  id: string;
  balance: number;
}

export function useWallet(_user: User | null) {
  const [wallet] = useState<Wallet | null>(null);
  const [loading] = useState(false);

  const refetch = useCallback(async () => {
    // Backend removed
  }, []);

  return { wallet, loading, refetch };
}
