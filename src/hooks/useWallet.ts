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

    // Polling fallback: re-fetch every 15s to catch missed realtime events
    if (!user) return;
    const interval = setInterval(fetchWallet, 15000);
    return () => clearInterval(interval);
  }, [fetchWallet, user]);

  // Realtime: atualiza saldo automaticamente quando muda no banco
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`wallet-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "wallets",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          if (payload.new && typeof payload.new === "object" && "id" in payload.new) {
            const row = payload.new as { id: string; balance: number };
            setWallet({ id: row.id, balance: Number(row.balance) });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  return { wallet, loading, refetch: fetchWallet };
}
