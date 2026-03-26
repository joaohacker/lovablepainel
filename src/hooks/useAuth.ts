import { useState, useCallback } from "react";

export function useAuth() {
  const [user] = useState(null);
  const [session] = useState(null);
  const [loading] = useState(false);
  const [isAdmin] = useState(false);

  const signIn = useCallback(async (_email: string, _password: string) => {
    // Backend removed
  }, []);

  const signUp = useCallback(async (_email: string, _password: string) => {
    // Backend removed
  }, []);

  const signOut = useCallback(async () => {
    // Backend removed
  }, []);

  return { user, session, loading, isAdmin, signIn, signUp, signOut };
}
