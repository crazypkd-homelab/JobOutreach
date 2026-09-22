import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "../api/client";

interface AuthUser {
  username: string;
}

interface AuthState {
  user: AuthUser | null;
  needsSetup: boolean;
  isLoading: boolean;
  error: string | null;
  register: (username: string, password: string) => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { needsSetup: setup } = await api.auth.setup();
      setNeedsSetup(setup);
      if (!setup) {
        try {
          const me = await api.auth.me();
          setUser(me);
        } catch {
          setUser(null);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to reach server");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const register = async (username: string, password: string) => {
    setError(null);
    const me = await api.auth.register({ username, password });
    setUser(me);
    setNeedsSetup(false);
  };

  const login = async (username: string, password: string) => {
    setError(null);
    const me = await api.auth.login({ username, password });
    setUser(me);
  };

  const logout = async () => {
    setError(null);
    await api.auth.logout();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, needsSetup, isLoading, error, register, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
