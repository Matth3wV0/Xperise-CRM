"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Zap, Eye, EyeOff } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await apiPost<{
        token: string;
        user: { id: string; email: string; name: string; role: "ADMIN" | "MANAGER" | "BD_STAFF" | "VIEWER" };
      }>("/auth/login", { email, password });
      login(res.token, res.user);
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid credentials");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen bg-background">
      {/* Left panel — branding */}
      <div className="hidden lg:flex lg:w-[45%] flex-col justify-between bg-card border-r border-border p-10">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
            <Zap className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="text-base font-semibold">Xperise CRM</span>
        </div>

        <div className="space-y-6">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight text-foreground leading-tight">
              Your BD pipeline,
              <br />
              under control.
            </h1>
            <p className="text-muted-foreground text-sm leading-relaxed max-w-xs">
              Track leads, manage outreach, and close deals faster — all in one place for the Xperise BD team.
            </p>
          </div>

          <div className="space-y-3">
            {[
              { label: "Lead tracking", desc: "From first contact to conversion" },
              { label: "Pipeline visibility", desc: "Deal stages and revenue forecasting" },
              { label: "Team sync", desc: "Telegram-integrated daily workflow" },
            ].map((f) => (
              <div key={f.label} className="flex items-start gap-2.5">
                <div className="mt-0.5 h-5 w-5 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                  <div className="h-2 w-2 rounded-full bg-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium">{f.label}</p>
                  <p className="text-xs text-muted-foreground">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          © {new Date().getFullYear()} Xperise. Internal BD tool.
        </p>
      </div>

      {/* Right panel — login form */}
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="w-full max-w-sm space-y-8">
          {/* Mobile logo */}
          <div className="flex items-center gap-2.5 lg:hidden">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <Zap className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="text-base font-semibold">Xperise CRM</span>
          </div>

          <div className="space-y-1">
            <h2 className="text-2xl font-bold tracking-tight">Sign in</h2>
            <p className="text-sm text-muted-foreground">
              Enter your credentials to access the BD dashboard
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            {error && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-red-400">
                {error}
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Email</label>
              <input
                type="email"
                required
                autoComplete="email"
                className="w-full rounded-lg border border-border bg-secondary px-3.5 py-2.5 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary"
                placeholder="you@xperise.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  className="w-full rounded-lg border border-border bg-secondary px-3.5 py-2.5 pr-10 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary"
                  placeholder="Enter password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
                  Signing in...
                </span>
              ) : (
                "Sign in"
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
