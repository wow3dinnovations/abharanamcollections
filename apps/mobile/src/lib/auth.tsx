import type { Session } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "./supabase";

type Auth = { session: Session | null; ready: boolean };
const AuthContext = createContext<Auth>({ session: null, ready: false });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<Auth>({ session: null, ready: false });
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setAuth({ session: data.session, ready: true }));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setAuth({ session, ready: true }));
    return () => data.subscription.unsubscribe();
  }, []);
  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
