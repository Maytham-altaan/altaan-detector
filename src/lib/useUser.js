import { useEffect, useState, useCallback } from "react";
import { getMe, setToken as setApiToken } from "./api.js";

/* Tracks current signed-in user, plan, and usage.
   In dev (no backend) this gracefully resolves to null so the UI still works. */
export function useUser() {
  const [user, setUser] = useState(null);   // { email, plan, usage:{used, limit} } or null
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const me = await getMe();
      setUser(me);
    } catch (e) {
      // network/backend unavailable — keep user as null
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const signOut = useCallback(() => {
    setApiToken(null);
    setUser(null);
  }, []);

  return { user, loading, refresh, signOut };
}
