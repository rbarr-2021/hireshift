"use client";

import { useEffect, useMemo, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast-provider";
import { fetchWithSession } from "@/lib/route-client";

export type AdminUserListItem = {
  user: {
    id: string;
    email: string | null;
    role: string | null;
    display_name: string | null;
    onboarding_complete: boolean;
    suspended_at: string | null;
    suspended_reason: string | null;
    created_at: string;
  };
  workerProfile: {
    job_role: string;
    city: string;
    verification_status: string;
  } | null;
  businessProfile: {
    business_name: string;
    city: string;
    verification_status: string;
  } | null;
  workerDocumentCount: number;
  businessDocumentCount: number;
  pendingVerificationReview: boolean;
  displayLabel: string;
};

type AdminUserDocumentItem = {
  id: string;
  document_type: string;
  file_name: string;
  signed_url: string | null;
};

type UserTab = "all" | "worker" | "business" | "suspended";

type AdminUsersManagerProps = {
  title: string;
  description: string;
  initialTab?: UserTab;
  lockedRole?: "worker" | "business";
};

function formatJoinedDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

export function AdminUsersManager({
  title,
  description,
  initialTab = "all",
  lockedRole,
}: AdminUsersManagerProps) {
  const { showToast } = useToast();
  const [items, setItems] = useState<AdminUserListItem[]>([]);
  const [counts, setCounts] = useState({
    all: 0,
    workers: 0,
    businesses: 0,
    suspended: 0,
    pendingVerificationReviews: 0,
    pendingBusinessVerificationReviews: 0,
  });
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState<UserTab>(
    lockedRole === "business" ? "business" : lockedRole === "worker" ? "worker" : initialTab,
  );
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [composerUserId, setComposerUserId] = useState<string | null>(null);
  const [documentsUserId, setDocumentsUserId] = useState<string | null>(null);
  const [loadingDocumentsUserId, setLoadingDocumentsUserId] = useState<string | null>(null);
  const [documentsByUserId, setDocumentsByUserId] = useState<Record<string, AdminUserDocumentItem[]>>({});
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (lockedRole) {
      setActiveTab(lockedRole);
    }
  }, [lockedRole]);

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams();
        if (query.trim()) params.set("query", query.trim());

        const effectiveRole =
          lockedRole ?? (activeTab === "worker" || activeTab === "business" ? activeTab : null);

        if (effectiveRole) params.set("role", effectiveRole);
        if (activeTab === "suspended") params.set("status", "suspended");

        const response = await fetchWithSession(`/api/admin/users?${params.toString()}`);
        const payload = (await response.json()) as {
          error?: string;
          items?: AdminUserListItem[];
          counts?: typeof counts;
        };

        if (!response.ok) {
          throw new Error(payload.error || "Unable to load admin users.");
        }

        if (active) {
          setItems(payload.items ?? []);
          setCounts(
            payload.counts ?? {
              all: 0,
              workers: 0,
              businesses: 0,
              suspended: 0,
              pendingVerificationReviews: 0,
              pendingBusinessVerificationReviews: 0,
            },
          );
        }
      } catch (nextError) {
        const nextMessage =
          nextError instanceof Error ? nextError.message : "Unable to load admin users.";

        if (active) {
          setError(nextMessage);
          setItems([]);
        }

        showToast({
          title: "Users unavailable",
          description: nextMessage,
          tone: "error",
        });
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, [activeTab, lockedRole, query, showToast]);

  const tabCounts = useMemo(
    () => ({
      all: counts.all,
      worker: counts.workers,
      business: counts.businesses,
      suspended: lockedRole === "business" ? items.filter((item) => Boolean(item.user.suspended_at)).length : counts.suspended,
    }),
    [counts, items, lockedRole],
  );

  const handleVerificationAction = async (
    item: AdminUserListItem,
    action: "approve_verification" | "reject_verification",
  ) => {
    setActioningId(item.user.id);

    try {
      const response = await fetchWithSession(`/api/admin/users/${item.user.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action }),
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error || "Unable to update verification.");
      }

      setItems((current) =>
        current.map((candidate) => {
          if (candidate.user.id !== item.user.id) {
            return candidate;
          }

          if (candidate.workerProfile) {
            return {
              ...candidate,
              workerProfile: {
                ...candidate.workerProfile,
                verification_status:
                  action === "approve_verification" ? "verified" : "rejected",
              },
              pendingVerificationReview: false,
            };
          }

          if (candidate.businessProfile) {
            return {
              ...candidate,
              businessProfile: {
                ...candidate.businessProfile,
                verification_status:
                  action === "approve_verification" ? "verified" : "rejected",
              },
              pendingVerificationReview: false,
            };
          }

          return candidate;
        }),
      );

      setCounts((current) => ({
        ...current,
        pendingVerificationReviews: Math.max(0, current.pendingVerificationReviews - 1),
        pendingBusinessVerificationReviews:
          item.user.role === "business"
            ? Math.max(0, current.pendingBusinessVerificationReviews - 1)
            : current.pendingBusinessVerificationReviews,
      }));

      showToast({
        title:
          action === "approve_verification" ? "Profile approved" : "Changes requested",
        description:
          action === "approve_verification"
            ? "The trusted badge is now live on this profile."
            : "This profile is back in changes-required status.",
        tone: "success",
      });
    } catch (nextError) {
      const nextMessage =
        nextError instanceof Error ? nextError.message : "Unable to update verification.";
      showToast({
        title: "Verification update failed",
        description: nextMessage,
        tone: "error",
      });
    } finally {
      setActioningId(null);
    }
  };

  const visibleTabs: UserTab[] = useMemo(() => {
    if (lockedRole === "business") {
      return ["business", "suspended"];
    }

    if (lockedRole === "worker") {
      return ["worker", "suspended"];
    }

    return ["all", "worker", "business", "suspended"];
  }, [lockedRole]);

  const handleSuspendToggle = async (item: AdminUserListItem) => {
    const suspending = !item.user.suspended_at;
    const reason = suspending
      ? window.prompt("Reason for suspension", "Suspended by admin.")?.trim() ?? ""
      : "";

    if (suspending && !reason) {
      return;
    }

    setActioningId(item.user.id);

    try {
      const response = await fetchWithSession(`/api/admin/users/${item.user.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: suspending ? "suspend" : "unsuspend",
          reason,
        }),
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error || "Unable to update the user.");
      }

      setItems((current) =>
        current.map((candidate) =>
          candidate.user.id === item.user.id
            ? {
                ...candidate,
                user: {
                  ...candidate.user,
                  suspended_at: suspending ? new Date().toISOString() : null,
                  suspended_reason: suspending ? reason : null,
                },
              }
            : candidate,
        ),
      );

      showToast({
        title: suspending ? "User suspended" : "User restored",
        description: suspending
          ? "This user will no longer be able to access NexHyr."
          : "This user can access NexHyr again.",
        tone: "success",
      });
    } catch (nextError) {
      const nextMessage =
        nextError instanceof Error ? nextError.message : "Unable to update the user.";
      showToast({
        title: "Update failed",
        description: nextMessage,
        tone: "error",
      });
    } finally {
      setActioningId(null);
    }
  };

  const handleDelete = async (item: AdminUserListItem) => {
    if (
      typeof window !== "undefined" &&
      !window.confirm(`Delete ${item.displayLabel}? This removes the auth account too.`)
    ) {
      return;
    }

    setActioningId(item.user.id);

    try {
      const response = await fetchWithSession(`/api/admin/users/${item.user.id}`, {
        method: "DELETE",
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error || "Unable to delete the user.");
      }

      setItems((current) => current.filter((candidate) => candidate.user.id !== item.user.id));
      showToast({
        title: "User deleted",
        description: "The account has been removed.",
        tone: "success",
      });
    } catch (nextError) {
      const nextMessage =
        nextError instanceof Error ? nextError.message : "Unable to delete the user.";
      showToast({
        title: "Delete failed",
        description: nextMessage,
        tone: "error",
      });
    } finally {
      setActioningId(null);
    }
  };

  const handleSendMessage = async (userId: string) => {
    if (!subject.trim() || !message.trim()) {
      showToast({
        title: "Message incomplete",
        description: "Add a subject and message before sending.",
        tone: "info",
      });
      return;
    }

    setActioningId(userId);

    try {
      const response = await fetchWithSession(`/api/admin/users/${userId}/message`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          subject,
          message,
        }),
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error || "Unable to send the message.");
      }

      setComposerUserId(null);
      setSubject("");
      setMessage("");
      showToast({
        title: "Message sent",
        description: "The user has been emailed from admin.",
        tone: "success",
      });
    } catch (nextError) {
      const nextMessage =
        nextError instanceof Error ? nextError.message : "Unable to send the message.";
      showToast({
        title: "Message failed",
        description: nextMessage,
        tone: "error",
      });
    } finally {
      setActioningId(null);
    }
  };

  const handleViewDocuments = async (userId: string) => {
    if (documentsUserId === userId) {
      setDocumentsUserId(null);
      return;
    }

    setDocumentsUserId(userId);

    if (documentsByUserId[userId]) {
      return;
    }

    setLoadingDocumentsUserId(userId);

    try {
      const response = await fetchWithSession(`/api/admin/users/${userId}/documents`);
      const payload = (await response.json()) as {
        error?: string;
        items?: AdminUserDocumentItem[];
      };

      if (!response.ok) {
        throw new Error(payload.error || "Unable to load documents.");
      }

      setDocumentsByUserId((current) => ({
        ...current,
        [userId]: payload.items ?? [],
      }));
    } catch (nextError) {
      const nextMessage =
        nextError instanceof Error ? nextError.message : "Unable to load documents.";
      showToast({
        title: "Documents unavailable",
        description: nextMessage,
        tone: "error",
      });
    } finally {
      setLoadingDocumentsUserId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="section-label">NexHyr admin</p>
          <h1 className="mt-3 text-2xl font-semibold text-stone-900 sm:text-3xl">
            {title}
          </h1>
          <p className="mt-3 text-sm leading-6 text-stone-600">{description}</p>
        </div>
      </div>

      <section className="panel-soft p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {visibleTabs.map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                  activeTab === tab
                    ? "bg-stone-900 text-white"
                    : "bg-stone-100 text-stone-700 hover:bg-stone-200"
                }`}
              >
                {tab === "all"
                  ? `All users (${tabCounts.all})`
                  : tab === "worker"
                  ? `Workers (${tabCounts.worker})`
                  : tab === "business"
                  ? `Businesses (${tabCounts.business})`
                  : `Suspended (${tabCounts.suspended})`}
              </button>
            ))}
          </div>

          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name, email, role, city"
            className="input w-full lg:max-w-sm"
          />
        </div>
      </section>

      <section className="panel-soft p-5 sm:p-6">
        {loading ? (
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-40 w-full" />
            ))}
          </div>
        ) : error ? (
          <div className="mobile-empty-state">
            <h2 className="text-xl font-semibold text-stone-900">Users unavailable</h2>
            <p className="mt-3 text-sm leading-6 text-stone-600">{error}</p>
          </div>
        ) : items.length === 0 ? (
          <div className="mobile-empty-state">
            <h2 className="text-xl font-semibold text-stone-900">No users found</h2>
            <p className="mt-3 text-sm leading-6 text-stone-600">
              Try another tab or search term.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {items.map((item) => (
              <article key={item.user.id} className="rounded-[2rem] border border-white/10 bg-black/40 p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-semibold text-stone-100">{item.displayLabel}</h2>
                      <span className="status-badge">{item.user.role || "No role"}</span>
                      {item.user.suspended_at ? (
                        <span className="status-badge">Suspended</span>
                      ) : (
                        <span className="status-badge status-badge--ready">Active</span>
                      )}
                    </div>
                    <p className="mt-2 text-sm text-stone-400">{item.user.email || "No email"}</p>
                    <div className="mt-3 grid gap-2 text-sm text-stone-400 sm:grid-cols-2">
                      <p>Joined {formatJoinedDate(item.user.created_at)}</p>
                      <p>
                        {item.workerProfile
                          ? `${item.workerProfile.job_role} | ${item.workerProfile.city}`
                          : item.businessProfile
                          ? `${item.businessProfile.business_name} | ${item.businessProfile.city}`
                          : "Profile not completed"}
                      </p>
                      <p>
                        Onboarding {item.user.onboarding_complete ? "complete" : "incomplete"}
                      </p>
                      <p>
                        Verification{" "}
                        {item.workerProfile?.verification_status ||
                          item.businessProfile?.verification_status ||
                          "n/a"}
                      </p>
                      <p>
                        Review docs{" "}
                        {item.user.role === "worker"
                          ? item.workerDocumentCount
                          : item.businessDocumentCount}
                      </p>
                    </div>
                    {item.pendingVerificationReview ? (
                      <div className="mt-4 inline-flex rounded-full border border-[#67B7FF]/30 bg-[#14203A] px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-[#CFE6FF]">
                        Review waiting
                      </div>
                    ) : null}
                    {item.user.suspended_reason ? (
                      <p className="mt-3 text-sm text-red-300">
                        Reason: {item.user.suspended_reason}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
                    {item.pendingVerificationReview ? (
                      <>
                        <button
                          type="button"
                          onClick={() => void handleVerificationAction(item, "approve_verification")}
                          disabled={actioningId === item.user.id}
                          className="primary-btn w-full px-5 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {actioningId === item.user.id ? "Updating..." : "Approve badge"}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleVerificationAction(item, "reject_verification")}
                          disabled={actioningId === item.user.id}
                          className="secondary-btn w-full px-5 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Request changes
                        </button>
                      </>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => void handleSuspendToggle(item)}
                      disabled={actioningId === item.user.id}
                      className="secondary-btn w-full px-5 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {actioningId === item.user.id
                        ? "Updating..."
                        : item.user.suspended_at
                        ? "Restore"
                        : "Suspend"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleViewDocuments(item.user.id)}
                      disabled={loadingDocumentsUserId === item.user.id}
                      className="secondary-btn w-full px-5 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {loadingDocumentsUserId === item.user.id
                        ? "Loading docs..."
                        : documentsUserId === item.user.id
                          ? "Hide documents"
                          : "View documents"}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setComposerUserId((current) =>
                          current === item.user.id ? null : item.user.id,
                        )
                      }
                      disabled={actioningId === item.user.id}
                      className="secondary-btn w-full px-5 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Message
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(item)}
                      disabled={actioningId === item.user.id}
                      className="secondary-btn w-full px-5 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Delete
                    </button>
                  </div>
                </div>

                {composerUserId === item.user.id ? (
                  <div className="mt-5 rounded-[1.5rem] border border-white/10 bg-black/30 p-4">
                    <div className="grid gap-3">
                      <input
                        value={subject}
                        onChange={(event) => setSubject(event.target.value)}
                        placeholder="Subject"
                        className="input"
                      />
                      <textarea
                        value={message}
                        onChange={(event) => setMessage(event.target.value)}
                        placeholder="Message"
                        className="input min-h-28 resize-y"
                      />
                      <div className="flex flex-col gap-3 sm:flex-row">
                        <button
                          type="button"
                          onClick={() => void handleSendMessage(item.user.id)}
                          disabled={actioningId === item.user.id}
                          className="primary-btn w-full px-5 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                        >
                          {actioningId === item.user.id ? "Sending..." : "Send message"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setComposerUserId(null);
                            setSubject("");
                            setMessage("");
                          }}
                          className="secondary-btn w-full px-5 sm:w-auto"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}

                {documentsUserId === item.user.id ? (
                  <div className="mt-5 rounded-[1.5rem] border border-white/10 bg-black/30 p-4">
                    <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-stone-300">
                      Uploaded documents
                    </h3>
                    <div className="mt-3 space-y-2">
                      {(documentsByUserId[item.user.id] ?? []).length > 0 ? (
                        (documentsByUserId[item.user.id] ?? []).map((document) => (
                          <div
                            key={document.id}
                            className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-black/30 p-3 sm:flex-row sm:items-center sm:justify-between"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-stone-100">
                                {document.file_name}
                              </p>
                              <p className="mt-1 text-xs uppercase tracking-[0.16em] text-stone-400">
                                {document.document_type.replaceAll("_", " ")}
                              </p>
                            </div>
                            {document.signed_url ? (
                              <a
                                href={document.signed_url}
                                target="_blank"
                                rel="noreferrer"
                                className="secondary-btn w-full px-4 py-2 sm:w-auto"
                              >
                                Open
                              </a>
                            ) : (
                              <span className="status-badge">No preview</span>
                            )}
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-stone-400">No uploaded documents found.</p>
                      )}
                    </div>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
