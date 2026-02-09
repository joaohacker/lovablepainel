import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const adminCheckDone = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const checkAdmin = async (userId: string): Promise<boolean> => {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const { data, error } = await supabase
            .from("user_roles")
            .select("role")
            .eq("user_id", userId)
            .eq("role", "admin")
            .maybeSingle();
          if (error) throw error;
          return !!data;
        } catch (err) {
          console.warn(`useAuth: admin check attempt ${attempt + 1} failed`, err);
          if (attempt < 2) await new Promise(r => setTimeout(r, 500));
        }
      }
      return false;
    };

    const handleSession = async (s: Session | null) => {
      if (cancelled) return;
      setSession(s);
      setUser(s?.user ?? null);

      if (s?.user) {
        const admin = await checkAdmin(s.user.id);
        if (!cancelled) {
          setIsAdmin(admin);
          adminCheckDone.current = true;
        }
      } else {
        setIsAdmin(false);
        adminCheckDone.current = true;
      }
      if (!cancelled) setLoading(false);
    };

    // Get initial session
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      handleSession(s);
    }).catch(() => {
      if (!cancelled) setLoading(false);
    });

    // Listen for auth changes (login/logout)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, s) => {
        // Skip INITIAL_SESSION if we already handled it via getSession
        if (_event === "INITIAL_SESSION" && adminCheckDone.current) return;
        handleSession(s);
      }
    );

    // Safety timeout
    const timeout = setTimeout(() => {
      if (!cancelled) setLoading(false);
    }, 5000);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  return { user, session, loading, isAdmin, signIn, signUp, signOut };
}
