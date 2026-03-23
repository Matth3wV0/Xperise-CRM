"use client";

import { useState, useEffect, useCallback } from "react";
import { MessageCircle, Copy, CheckCheck, RefreshCw, Link2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { apiGet, apiPost, apiPut } from "@/lib/api";
import { useAuth } from "@/lib/auth";

interface TelegramStatus {
  bound: boolean;
  telegramName: string | null;
  boundAt: string | null;
}

interface GenerateCodeResponse {
  code: string;
  expiresAt: string;
}

interface TelegramGroup {
  id: string;
  chatId: string;
  name: string;
  isActive: boolean;
  addedAt: string;
}

export function TelegramConnect() {
  const { canManage } = useAuth();
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  // Group management
  const [groups, setGroups] = useState<TelegramGroup[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [activating, setActivating] = useState(false);
  const [activateError, setActivateError] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      const res = await apiGet<TelegramStatus>("/telegram/status");
      setStatus(res);
    } catch {}
  }, []);

  const loadGroups = useCallback(async () => {
    setGroupsLoading(true);
    try {
      const res = await apiGet<{ groups: TelegramGroup[] }>("/telegram/groups");
      setGroups(res.groups);
    } catch {}
    setGroupsLoading(false);
  }, []);

  useEffect(() => {
    loadStatus();
    loadGroups();
  }, [loadStatus, loadGroups]);

  // Countdown timer
  useEffect(() => {
    if (!expiresAt) return;
    const interval = setInterval(() => {
      const secs = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
      setSecondsLeft(secs);
      if (secs === 0) {
        setCode(null);
        setExpiresAt(null);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  async function handleGenerate() {
    setLoading(true);
    try {
      const res = await apiPost<GenerateCodeResponse>("/telegram/generate-code", {});
      setCode(res.code);
      setExpiresAt(new Date(res.expiresAt));
      setSecondsLeft(600);
    } catch (err) {
      console.error("Failed to generate code:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy() {
    if (!code) return;
    await navigator.clipboard.writeText(`/bind ${code}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleActivateGroup(groupId: string) {
    setActivating(true);
    setActivateError(null);
    try {
      await apiPut(`/telegram/groups/${groupId}/activate`, {});
      setGroups((prev) =>
        prev.map((g) => ({ ...g, isActive: g.id === groupId }))
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Lỗi không xác định";
      setActivateError(msg);
    }
    setActivating(false);
  }

  const mins = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;
  const timerColor = secondsLeft < 60 ? "text-destructive" : "text-muted-foreground";
  const activeGroup = groups.find((g) => g.isActive);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <MessageCircle className="h-4 w-4" />
              Telegram Bot
            </CardTitle>
            <CardDescription>
              Link tài khoản và chọn group nhận thông báo
            </CardDescription>
          </div>
          {status?.bound && (
            <Badge variant="default" className="bg-emerald-600 text-white">
              Đã kết nối
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Already bound */}
        {status?.bound && (
          <div className="rounded-lg border bg-emerald-950/20 border-emerald-800/30 p-4 space-y-1">
            <p className="text-sm font-medium text-emerald-400 flex items-center gap-2">
              <Link2 className="h-3.5 w-3.5" />
              {status.telegramName ?? "Telegram account"}
            </p>
            {status.boundAt && (
              <p className="text-xs text-muted-foreground">
                Linked{" "}
                {new Date(status.boundAt).toLocaleDateString("vi-VN", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                })}
              </p>
            )}
          </div>
        )}

        {/* Not bound yet */}
        {status && !status.bound && (
          <div className="space-y-4">
            <div className="rounded-lg border border-dashed p-4 space-y-2 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">Cách kết nối:</p>
              <ol className="list-decimal list-inside space-y-1">
                <li>
                  Click <span className="font-medium text-foreground">"Lấy mã"</span> để tạo code
                </li>
                <li>
                  Mở Telegram, tìm{" "}
                  <span className="font-mono text-foreground">@xperise_bot</span>
                </li>
                <li>Gửi lệnh <span className="font-mono text-foreground">/bind CODE</span></li>
              </ol>
            </div>

            {/* Code display */}
            {code ? (
              <div className="space-y-3">
                <div className="rounded-lg border bg-secondary/50 p-4 text-center">
                  <p className="text-xs text-muted-foreground mb-1">Lệnh bind của bạn</p>
                  <p className="font-mono text-2xl font-bold tracking-widest">
                    /bind {code}
                  </p>
                  <p className={`text-xs mt-2 tabular-nums ${timerColor}`}>
                    Hết hạn sau {mins}:{secs.toString().padStart(2, "0")}
                  </p>
                </div>

                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={handleCopy}
                  >
                    {copied ? (
                      <><CheckCheck className="mr-2 h-4 w-4 text-emerald-500" /> Đã copy</>
                    ) : (
                      <><Copy className="mr-2 h-4 w-4" /> Copy lệnh</>
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleGenerate}
                    disabled={loading}
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>

                <p className="text-xs text-center text-muted-foreground">
                  Sau khi bind xong, refresh trang này để xác nhận
                </p>
              </div>
            ) : (
              <Button
                size="sm"
                className="w-full"
                onClick={handleGenerate}
                disabled={loading}
              >
                {loading ? (
                  <><RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Đang tạo...</>
                ) : (
                  <><MessageCircle className="mr-2 h-4 w-4" /> Lấy mã Telegram</>
                )}
              </Button>
            )}
          </div>
        )}

        {/* Loading skeleton */}
        {!status && (
          <div className="h-20 rounded-lg bg-secondary/30 animate-pulse" />
        )}

        {/* ── Group selector (ADMIN/MANAGER only) ──────────────── */}
        {canManage && (
          <div className="space-y-3 border-t pt-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Users className="h-4 w-4" />
              Group nhận thông báo
            </div>

            {groupsLoading ? (
              <div className="h-10 rounded-lg bg-secondary/30 animate-pulse" />
            ) : groups.length === 0 ? (
              <div className="rounded-lg border border-dashed p-4 text-center">
                <p className="text-sm text-muted-foreground">
                  Chưa có group nào. Thêm bot vào group Telegram rồi gửi <span className="font-mono text-foreground">/start</span> để đăng ký.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <select
                  value={activeGroup?.id ?? ""}
                  onChange={(e) => {
                    if (e.target.value) handleActivateGroup(e.target.value);
                  }}
                  disabled={activating}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="" disabled>
                    -- Chọn group --
                  </option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name} {g.isActive ? "(Active)" : ""}
                    </option>
                  ))}
                </select>

                {activeGroup && (
                  <p className="text-xs text-emerald-400">
                    Bot đang nhận tin ở: <span className="font-medium">{activeGroup.name}</span>
                  </p>
                )}

                {!activeGroup && groups.length > 0 && (
                  <p className="text-xs text-amber-400">
                    Chưa chọn group. Cron jobs và thông báo sẽ dùng env var mặc định.
                  </p>
                )}

                {activateError && (
                  <p className="text-xs text-destructive">
                    Lỗi: {activateError}
                  </p>
                )}
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              Gửi <span className="font-mono">/start</span> trong group mới để thêm vào danh sách.
              Nhấn <Button variant="ghost" size="sm" className="h-5 px-1" onClick={loadGroups} disabled={groupsLoading}>
                <RefreshCw className={`h-3 w-3 ${groupsLoading ? "animate-spin" : ""}`} />
              </Button> để refresh.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
