import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";

interface Wallet {
  id: string;
  balance: number;
}

export function useWallet(user: User | null) {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchWallet = useCallback(async () => {
    if (!user) {
      setWallet(null);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("wallets")
        .select("id, balance")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!error && data) {
        setWallet({ id: data.id, balance: Number(data.balance) });
      } else {
        setWallet(null);
      }
    } catch {
      setWallet(null);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchWallet();
  }, [fetchWallet]);

  return { wallet, loading, refetch: fetchWallet };
}
