"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import { apiGet } from "./api";

interface User {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "MANAGER" | "BD_STAFF" | "VIEWER";
  avatar?: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (token: string, user: User) => void;
  logout: () => void;
  hasRole: (...roles: string[]) => boolean;
  canEdit: boolean;
  canManage: boolean;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

const PUBLIC_PATHS = ["/login"];

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const stored = localStorage.getItem("xperise_token");
    if (stored) {
      setToken(stored);
      apiGet<{ user: User }>("/auth/me")
        .then((res) => {
          setUser(res.user);
        })
        .catch(() => {
          localStorage.removeItem("xperise_token");
          localStorage.removeItem("xperise_user");
          router.push("/login");
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
      if (!PUBLIC_PATHS.includes(pathname)) {
        router.push("/login");
      }
    }
  }, [pathname, router]);

  const login = useCallback((newToken: string, newUser: User) => {
    localStorage.setItem("xperise_token", newToken);
    localStorage.setItem("xperise_user", JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("xperise_token");
    localStorage.removeItem("xperise_user");
    setToken(null);
    setUser(null);
    router.push("/login");
  }, [router]);

  const hasRole = useCallback(
    (...roles: string[]) => user !== null && roles.includes(user.role),
    [user]
  );

  const canEdit = hasRole("ADMIN", "MANAGER", "BD_STAFF");
  const canManage = hasRole("ADMIN", "MANAGER");
  const isAdmin = hasRole("ADMIN");

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!user && !PUBLIC_PATHS.includes(pathname)) {
    return null;
  }

  return (
    <AuthContext.Provider
      value={{ user, token, loading, login, logout, hasRole, canEdit, canManage, isAdmin }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
