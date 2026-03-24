"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Plus,
  Play,
  Pause,
  Loader2,
  ChevronRight,
  Mail,
  Users,
  Eye,
  Send,
  AlertCircle,
  Clock,
  Link2,
  RefreshCw,
  CheckCircle2,
  MessageSquareReply,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { apiGet, apiPost } from "@/lib/api";

// ── Types ────────────────────────────────────────────────────────────────────

interface CampaignStep {
  id: string;
  stepOrder: number;
  delayDays: number;
  subject: string;
  body: string;
}

interface Campaign {
  id: string;
  name: string;
  status: string;
  apolloSequenceId: string | null;
  createdAt: string;
  createdBy: { id: string; name: string };
  steps: CampaignStep[];
  totalRecipients: number;
  totalEmails: number;
  statusCounts: Record<string, number>;
}

interface Contact {
  id: string;
  fullName: string;
  email: string | null;
  position: string | null;
  company: { name: string };
}

interface ApolloSequence {
  id: string;
  name: string;
  active: boolean;
  numSteps: number;
}

interface ApolloEmailAccount {
  id: string;
  email: string;
  type: string;
}

// ── Constants ────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  DRAFT: "outline",
  ACTIVE: "default",
  PAUSED: "secondary",
  COMPLETED: "default",
  CANCELLED: "destructive",
};

const EMAIL_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Nháp",
  PENDING_APPROVAL: "Chờ duyệt",
  APPROVED: "Đã duyệt",
  SENDING: "Đang gửi",
  SENT: "Đã gửi",
  OPENED: "Đã mở",
  REPLIED: "Đã phản hồi",
  BOUNCED: "Bounce",
  REJECTED: "Từ chối",
};

// ── Component ────────────────────────────────────────────────────────────────

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  // Create form
  const [name, setName] = useState("");
  const [steps, setSteps] = useState([
    { stepOrder: 0, delayDays: 0, subject: "", body: "" },
  ]);

  // Detail view
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Add recipients
  const [showAddRecipients, setShowAddRecipients] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set());
  const [addingRecipients, setAddingRecipients] = useState(false);

  // Apollo sequence linking
  const [apolloSequences, setApolloSequences] = useState<ApolloSequence[]>([]);
  const [apolloAccounts, setApolloAccounts] = useState<ApolloEmailAccount[]>([]);
  const [selectedSequenceId, setSelectedSequenceId] = useState("");
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [linking, setLinking] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [showLinkSequence, setShowLinkSequence] = useState(false);

  const loadCampaigns = useCallback(async () => {
    try {
      const res = await apiGet<{ campaigns: Campaign[] }>("/campaigns");
      setCampaigns(res.campaigns);
    } catch {
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCampaigns();
  }, [loadCampaigns]);

  async function loadDetail(id: string) {
    setSelectedId(id);
    setLoadingDetail(true);
    try {
      const res = await apiGet<{ campaign: any }>(`/campaigns/${id}`);
      setDetail(res.campaign);
    } catch {
    } finally {
      setLoadingDetail(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setCreating(true);

    try {
      await apiPost("/campaigns", { name, steps });
      setName("");
      setSteps([{ stepOrder: 0, delayDays: 0, subject: "", body: "" }]);
      setShowCreate(false);
      loadCampaigns();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create");
    } finally {
      setCreating(false);
    }
  }

  function addStep() {
    setSteps((prev) => [
      ...prev,
      {
        stepOrder: prev.length,
        delayDays: 3,
        subject: "",
        body: "",
      },
    ]);
  }

  function updateStep(index: number, field: string, value: string | number) {
    setSteps((prev) =>
      prev.map((s, i) => (i === index ? { ...s, [field]: value } : s))
    );
  }

  function removeStep(index: number) {
    if (steps.length <= 1) return;
    setSteps((prev) =>
      prev
        .filter((_, i) => i !== index)
        .map((s, i) => ({ ...s, stepOrder: i }))
    );
  }

  async function handleLaunch(id: string) {
    try {
      await apiPost(`/campaigns/${id}/launch`, {});
      loadCampaigns();
      if (selectedId === id) loadDetail(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to launch");
    }
  }

  async function handlePause(id: string) {
    try {
      await apiPost(`/campaigns/${id}/pause`, {});
      loadCampaigns();
      if (selectedId === id) loadDetail(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to pause");
    }
  }

  async function loadContacts() {
    try {
      const res = await apiGet<{ contacts: Contact[] }>("/contacts?limit=500");
      setContacts(res.contacts);
    } catch {}
  }

  async function handleAddRecipients() {
    if (!selectedId || selectedContacts.size === 0) return;
    setAddingRecipients(true);
    try {
      await apiPost(`/campaigns/${selectedId}/recipients`, {
        contactIds: Array.from(selectedContacts),
      });
      setSelectedContacts(new Set());
      setShowAddRecipients(false);
      loadDetail(selectedId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add recipients");
    } finally {
      setAddingRecipients(false);
    }
  }

  // ── Apollo Functions ───────────────────────────────────────────────────────

  async function loadApolloData() {
    try {
      const [seqRes, accRes] = await Promise.all([
        apiGet<{ sequences: ApolloSequence[] }>("/campaigns/apollo-sequences"),
        apiGet<{ emailAccounts: ApolloEmailAccount[] }>("/campaigns/apollo-email-accounts"),
      ]);
      setApolloSequences(seqRes.sequences);
      setApolloAccounts(accRes.emailAccounts);
    } catch {}
  }

  async function handleLinkSequence() {
    if (!selectedId || !selectedSequenceId) return;
    setLinking(true);
    setError("");
    try {
      await apiPost(`/campaigns/${selectedId}/link-sequence`, {
        apolloSequenceId: selectedSequenceId,
      });
      setShowLinkSequence(false);
      setSelectedSequenceId("");
      loadDetail(selectedId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to link sequence");
    } finally {
      setLinking(false);
    }
  }

  async function handleSyncApollo() {
    if (!selectedId) return;
    setSyncing(true);
    setError("");
    try {
      const result = await apiPost<{ synced: number; apolloContactsCreated: number; errors: string[] }>(
        `/campaigns/${selectedId}/sync-apollo`,
        selectedAccountId ? { emailAccountId: selectedAccountId } : {}
      );
      setError("");
      loadDetail(selectedId);
      loadCampaigns();
      alert(
        `Synced ${result.synced} contacts to Apollo.\n` +
        `${result.apolloContactsCreated} new Apollo contacts created.\n` +
        (result.errors.length > 0 ? `Errors: ${result.errors.join(", ")}` : "No errors.")
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to sync to Apollo");
    } finally {
      setSyncing(false);
    }
  }

  // ── Detail View ────────────────────────────────────────────────────────────
  if (selectedId) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSelectedId(null);
              setDetail(null);
            }}
          >
            ← Back
          </Button>
          <h1 className="text-xl font-bold">
            {detail?.name ?? "Loading..."}
          </h1>
          {detail && (
            <Badge variant={STATUS_COLORS[detail.status] ?? "outline"}>
              {detail.status}
            </Badge>
          )}
        </div>

        {loadingDetail ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : detail ? (
          <>
            {/* Steps */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Email Sequence ({detail.steps.length} steps)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {detail.steps.map((step: CampaignStep, i: number) => (
                  <div
                    key={step.id}
                    className="rounded-lg border p-3 space-y-1"
                  >
                    <div className="flex items-center gap-2 text-sm">
                      <Badge variant="outline" className="text-[10px]">
                        Step {i + 1}
                      </Badge>
                      {step.delayDays > 0 && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" /> +{step.delayDays} days
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-medium">{step.subject}</p>
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {step.body.replace(/<[^>]*>/g, "").slice(0, 200)}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Apollo Sequence */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Link2 className="h-4 w-4" /> Apollo Sequence
                  </CardTitle>
                  <CardDescription>
                    {detail.apolloSequenceId
                      ? "Linked — emails will be sent via Apollo"
                      : "Not linked — link an Apollo sequence to enable email sending"}
                  </CardDescription>
                </div>
                {detail.apolloSequenceId ? (
                  <div className="flex items-center gap-2">
                    <Badge variant="default" className="text-[10px]">
                      <CheckCircle2 className="mr-1 h-3 w-3" /> Linked
                    </Badge>
                    {/* Show sync button if there are APPROVED recipients */}
                    {(detail.recipients?.some((r: any) => r.status === "APPROVED")) && (
                      <Button
                        size="sm"
                        onClick={handleSyncApollo}
                        disabled={syncing}
                      >
                        {syncing ? (
                          <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <RefreshCw className="mr-1 h-3.5 w-3.5" />
                        )}
                        Sync to Apollo
                      </Button>
                    )}
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setShowLinkSequence(true);
                      loadApolloData();
                    }}
                  >
                    <Link2 className="mr-1 h-3.5 w-3.5" /> Link Sequence
                  </Button>
                )}
              </CardHeader>

              {/* Link Sequence Form */}
              {showLinkSequence && !detail.apolloSequenceId && (
                <CardContent className="border-t pt-4 space-y-3">
                  <div>
                    <label className="text-sm font-medium">Apollo Sequence</label>
                    {apolloSequences.length === 0 ? (
                      <p className="text-xs text-muted-foreground mt-1">
                        No sequences found. Create a sequence in Apollo dashboard first.
                      </p>
                    ) : (
                      <select
                        className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                        value={selectedSequenceId}
                        onChange={(e) => setSelectedSequenceId(e.target.value)}
                      >
                        <option value="">Select sequence...</option>
                        {apolloSequences.map((seq) => (
                          <option key={seq.id} value={seq.id}>
                            {seq.name} ({seq.numSteps} steps) {seq.active ? "" : "[inactive]"}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                  {apolloAccounts.length > 0 && (
                    <div>
                      <label className="text-sm font-medium">Send from (optional)</label>
                      <select
                        className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                        value={selectedAccountId}
                        onChange={(e) => setSelectedAccountId(e.target.value)}
                      >
                        <option value="">Default mailbox</option>
                        {apolloAccounts.map((acc) => (
                          <option key={acc.id} value={acc.id}>
                            {acc.email} ({acc.type})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={handleLinkSequence}
                      disabled={!selectedSequenceId || linking}
                    >
                      {linking ? (
                        <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Link2 className="mr-1 h-3.5 w-3.5" />
                      )}
                      Link
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setShowLinkSequence(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </CardContent>
              )}

              {/* Sync status + email stats when linked */}
              {detail.apolloSequenceId && (
                <CardContent className="border-t pt-4">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="rounded-lg border p-3 text-center">
                      <Send className="h-4 w-4 mx-auto text-blue-400" />
                      <p className="text-lg font-bold mt-1">
                        {(detail.statusCounts?.SENT ?? 0) + (detail.statusCounts?.SENDING ?? 0) + (detail.statusCounts?.OPENED ?? 0) + (detail.statusCounts?.REPLIED ?? 0)}
                      </p>
                      <p className="text-[10px] text-muted-foreground">Sent</p>
                    </div>
                    <div className="rounded-lg border p-3 text-center">
                      <Eye className="h-4 w-4 mx-auto text-green-400" />
                      <p className="text-lg font-bold mt-1">
                        {(detail.statusCounts?.OPENED ?? 0) + (detail.statusCounts?.REPLIED ?? 0)}
                      </p>
                      <p className="text-[10px] text-muted-foreground">Opened</p>
                    </div>
                    <div className="rounded-lg border p-3 text-center">
                      <MessageSquareReply className="h-4 w-4 mx-auto text-indigo-400" />
                      <p className="text-lg font-bold mt-1">
                        {detail.statusCounts?.REPLIED ?? 0}
                      </p>
                      <p className="text-[10px] text-muted-foreground">Replied</p>
                    </div>
                    <div className="rounded-lg border p-3 text-center">
                      <XCircle className="h-4 w-4 mx-auto text-red-400" />
                      <p className="text-lg font-bold mt-1">
                        {detail.statusCounts?.BOUNCED ?? 0}
                      </p>
                      <p className="text-[10px] text-muted-foreground">Bounced</p>
                    </div>
                  </div>
                </CardContent>
              )}
            </Card>

            {/* Recipients */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base">
                    Recipients ({detail.recipients?.length ?? 0})
                  </CardTitle>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setShowAddRecipients(true);
                      loadContacts();
                    }}
                  >
                    <Plus className="mr-1 h-3.5 w-3.5" /> Add
                  </Button>
                  {detail.status === "DRAFT" &&
                    detail.recipients?.length > 0 && (
                      <Button
                        size="sm"
                        onClick={() => handleLaunch(detail.id)}
                      >
                        <Play className="mr-1 h-3.5 w-3.5" /> Launch
                      </Button>
                    )}
                  {detail.status === "ACTIVE" && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => handlePause(detail.id)}
                    >
                      <Pause className="mr-1 h-3.5 w-3.5" /> Pause
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {detail.recipients?.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    Chưa có recipients. Thêm contacts vào campaign.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {detail.recipients?.map((r: any) => (
                      <div
                        key={r.id}
                        className="flex items-center gap-3 rounded-lg border p-2"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {r.contact.fullName}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {r.contact.email ?? "No email"} •{" "}
                            {r.contact.company?.name}
                          </p>
                        </div>
                        <Badge
                          variant={
                            r.status === "SENT" || r.status === "OPENED"
                              ? "default"
                              : r.status === "BOUNCED" ||
                                  r.status === "REJECTED"
                                ? "destructive"
                                : "secondary"
                          }
                          className="text-[10px]"
                        >
                          {EMAIL_STATUS_LABELS[r.status] ?? r.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Add Recipients Dialog */}
            {showAddRecipients && (
              <Card className="border-primary/30">
                <CardHeader>
                  <CardTitle className="text-base">
                    Add Contacts to Campaign
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="max-h-[300px] overflow-y-auto space-y-1">
                    {contacts
                      .filter((c) => c.email)
                      .map((contact) => (
                        <label
                          key={contact.id}
                          className="flex items-center gap-2 rounded p-2 hover:bg-muted/50 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={selectedContacts.has(contact.id)}
                            onChange={() => {
                              setSelectedContacts((prev) => {
                                const next = new Set(prev);
                                if (next.has(contact.id))
                                  next.delete(contact.id);
                                else next.add(contact.id);
                                return next;
                              });
                            }}
                            className="rounded"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm truncate">
                              {contact.fullName}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {contact.email} • {contact.company?.name}
                            </p>
                          </div>
                        </label>
                      ))}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <Button
                      size="sm"
                      onClick={handleAddRecipients}
                      disabled={
                        selectedContacts.size === 0 || addingRecipients
                      }
                    >
                      {addingRecipients ? (
                        <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Plus className="mr-1 h-3.5 w-3.5" />
                      )}
                      Add {selectedContacts.size} contacts
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setShowAddRecipients(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        ) : null}
      </div>
    );
  }

  // ── List View ──────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Campaigns</h1>
          <p className="text-muted-foreground">
            Quản lý email campaigns với multi-step sequences
          </p>
        </div>
        <Button onClick={() => setShowCreate(!showCreate)}>
          <Plus className="mr-2 h-4 w-4" /> New Campaign
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Create Form */}
      {showCreate && (
        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle className="text-base">Create Campaign</CardTitle>
            <CardDescription>
              Tạo campaign mới với email sequence
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="text-sm font-medium">Campaign Name</label>
                <input
                  required
                  placeholder="e.g. Q1 FMCG Outreach"
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              {/* Steps */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">
                    Email Steps ({steps.length})
                  </label>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={addStep}
                  >
                    <Plus className="mr-1 h-3 w-3" /> Add Step
                  </Button>
                </div>

                {steps.map((step, i) => (
                  <div key={i} className="rounded-lg border p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">
                        Step {i + 1}{" "}
                        {i > 0 && `(+${step.delayDays} days)`}
                      </span>
                      {i > 0 && (
                        <button
                          type="button"
                          className="text-xs text-destructive hover:underline"
                          onClick={() => removeStep(i)}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                    {i > 0 && (
                      <div>
                        <label className="text-xs text-muted-foreground">
                          Delay (days after previous step)
                        </label>
                        <input
                          type="number"
                          min="1"
                          className="mt-0.5 w-20 rounded border bg-background px-2 py-1 text-sm"
                          value={step.delayDays}
                          onChange={(e) =>
                            updateStep(i, "delayDays", Number(e.target.value))
                          }
                        />
                      </div>
                    )}
                    <input
                      required
                      placeholder="Email subject"
                      className="w-full rounded border bg-background px-2 py-1.5 text-sm"
                      value={step.subject}
                      onChange={(e) =>
                        updateStep(i, "subject", e.target.value)
                      }
                    />
                    <textarea
                      required
                      rows={4}
                      placeholder="Email body (HTML supported). Use {{name}}, {{company}}, {{position}} for personalization."
                      className="w-full rounded border bg-background px-2 py-1.5 text-sm resize-y"
                      value={step.body}
                      onChange={(e) => updateStep(i, "body", e.target.value)}
                    />
                  </div>
                ))}
              </div>

              <div className="flex gap-2">
                <Button type="submit" disabled={creating}>
                  {creating ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Mail className="mr-2 h-4 w-4" />
                  )}
                  Create Campaign
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setShowCreate(false)}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Campaign List */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : campaigns.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-12">
            <Mail className="h-12 w-12 text-muted-foreground/30" />
            <p className="mt-2 text-sm text-muted-foreground">
              Chưa có campaign nào. Tạo campaign đầu tiên.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {campaigns.map((campaign) => (
            <Card
              key={campaign.id}
              className="cursor-pointer hover:border-primary/30 transition-colors"
              onClick={() => loadDetail(campaign.id)}
            >
              <CardContent className="flex items-center gap-4 py-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate">
                      {campaign.name}
                    </p>
                    <Badge
                      variant={STATUS_COLORS[campaign.status] ?? "outline"}
                      className="text-[10px]"
                    >
                      {campaign.status}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {campaign.steps.length} steps • Created by{" "}
                    {campaign.createdBy.name} •{" "}
                    {new Date(campaign.createdAt).toLocaleDateString("vi-VN")}
                  </p>
                </div>

                {/* Stats */}
                <div className="hidden sm:flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" />
                    {campaign.totalRecipients}
                  </span>
                  <span className="flex items-center gap-1">
                    <Send className="h-3.5 w-3.5" />
                    {campaign.statusCounts?.SENT ?? 0}
                  </span>
                  <span className="flex items-center gap-1">
                    <Eye className="h-3.5 w-3.5" />
                    {campaign.statusCounts?.OPENED ?? 0}
                  </span>
                </div>

                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
