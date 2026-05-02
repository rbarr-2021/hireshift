"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthState } from "@/components/auth/auth-provider";
import { NexHyrLogo } from "@/components/brand/nexhyr-logo";
import { AddressAutocomplete } from "@/components/forms/address-autocomplete";
import {
  buildOnboardingDraftKey,
  clearOnboardingDraft,
  readOnboardingDraft,
  writeOnboardingDraft,
} from "@/lib/onboarding-draft";
import { supabase } from "@/lib/supabase";
import { normaliseInternationalPhoneNumber } from "@/lib/phone";
import { OnboardingProgress } from "@/components/onboarding/onboarding-progress";
import { useToast } from "@/components/ui/toast-provider";
import {
  CURRENT_PRIVACY_VERSION,
  CURRENT_TERMS_VERSION,
} from "@/lib/legal";
import {
  BUSINESS_DOCUMENT_LABELS,
  BUSINESS_SECTORS,
  type BusinessDocumentRecord,
  type BusinessDocumentType,
  type BusinessProfileRecord,
  type BusinessSector,
  type UserRecord,
} from "@/lib/models";
import { calculateBusinessProfileCompletion } from "@/lib/business-discovery";

type BusinessProfileFormProps = {
  mode: "onboarding" | "manage";
};

type SupabaseLikeError = {
  message?: string;
  details?: string | null;
  hint?: string | null;
  code?: string;
};

type BusinessDocumentFileState = Partial<Record<BusinessDocumentType, File | null>>;
type BusinessOnboardingDraft = {
  businessName: string;
  sector: BusinessSector | "Other" | "";
  otherSector: string;
  contactName: string;
  phone: string;
  addressLine1: string;
  city: string;
  postcode: string;
  description: string;
  legalAccepted: boolean;
};

function sanitiseFileName(value: string) {
  return value.replace(/[^a-zA-Z0-9.-]/g, "-").toLowerCase();
}

function formatSupabaseError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (error && typeof error === "object") {
    const candidate = error as SupabaseLikeError;
    const parts = [
      candidate.message,
      candidate.details ?? undefined,
      candidate.hint ?? undefined,
      candidate.code ? `code: ${candidate.code}` : undefined,
    ].filter(Boolean);

    if (parts.length > 0) {
      return parts.join(" | ");
    }
  }

  return "Unable to save your business profile.";
}

function statusStyles(status: BusinessProfileRecord["verification_status"] | "pending") {
  if (status === "verified") return "bg-emerald-100 text-emerald-900";
  if (status === "rejected") return "bg-red-100 text-red-900";
  return "bg-amber-100 text-amber-900";
}

function statusCopy(status: BusinessProfileRecord["verification_status"] | "pending") {
  if (status === "verified") {
    return "Trusted badge live. Workers will see your venue as approved.";
  }

  if (status === "rejected") {
    return "Upload a fresh document and we will put this back into review.";
  }

  return "Upload one document to request the trusted green tick on your profile.";
}

export function BusinessProfileForm({ mode }: BusinessProfileFormProps) {
  const router = useRouter();
  const { refreshAuthState } = useAuthState();
  const { showToast } = useToast();
  const [user, setUser] = useState<UserRecord | null>(null);
  const [businessName, setBusinessName] = useState("");
  const [sector, setSector] = useState<BusinessSector | "">(BUSINESS_SECTORS[0]);
  const [otherSector, setOtherSector] = useState("");
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [city, setCity] = useState("");
  const [postcode, setPostcode] = useState("");
  const [description, setDescription] = useState("");
  const [approvalStatus, setApprovalStatus] =
    useState<BusinessProfileRecord["verification_status"]>("pending");
  const [documents, setDocuments] = useState<BusinessDocumentFileState>({});
  const [existingDocuments, setExistingDocuments] = useState<
    Partial<Record<BusinessDocumentType, BusinessDocumentRecord>>
  >({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [legalAccepted, setLegalAccepted] = useState(false);
  const [viewingDocumentType, setViewingDocumentType] =
    useState<BusinessDocumentType | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [draftKey, setDraftKey] = useState<string | null>(null);
  const [draftRestored, setDraftRestored] = useState(false);

  useEffect(() => {
    let active = true;

    const hydrateForm = async () => {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();

      if (!authUser || !active) {
        return;
      }

      const [{ data: appUser }, { data: profile }, { data: businessDocuments }] = await Promise.all([
        supabase.from("users").select("*").eq("id", authUser.id).maybeSingle<UserRecord>(),
        supabase
          .from("business_profiles")
          .select("*")
          .eq("user_id", authUser.id)
          .maybeSingle<BusinessProfileRecord>(),
        supabase
          .from("business_documents")
          .select("*")
          .eq("business_id", authUser.id),
      ]);

      if (!active) return;

      const nextDraftKey = buildOnboardingDraftKey({
        form: "business_setup",
        userId: authUser.id,
        email: appUser?.email ?? authUser.email ?? null,
      });
      setDraftKey(nextDraftKey);
      const draft = readOnboardingDraft<BusinessOnboardingDraft>(nextDraftKey);

      setUser(appUser ?? null);
      setLegalAccepted(
        Boolean(
          appUser?.terms_accepted_at &&
            appUser?.privacy_accepted_at &&
            appUser?.terms_version === CURRENT_TERMS_VERSION &&
            appUser?.privacy_version === CURRENT_PRIVACY_VERSION,
        ),
      );

      if (profile) {
        setBusinessName(profile.business_name);
        if (BUSINESS_SECTORS.includes(profile.sector as BusinessSector)) {
          setSector(profile.sector as BusinessSector);
          setOtherSector("");
        } else {
          setSector("Other");
          setOtherSector(profile.sector);
        }
        setContactName(profile.contact_name ?? appUser?.display_name ?? "");
        setPhone(
          normaliseInternationalPhoneNumber(profile.phone ?? appUser?.phone ?? "") ??
            profile.phone ??
            appUser?.phone ??
            "",
        );
        setAddressLine1(profile.address_line_1);
        setCity(profile.city);
        setPostcode(profile.postcode ?? "");
        setDescription(profile.description ?? "");
        setApprovalStatus(profile.verification_status);
      } else {
        setBusinessName(draft?.businessName ?? "");
        setSector(
          draft?.sector && (BUSINESS_SECTORS.includes(draft.sector as BusinessSector) || draft.sector === "Other")
            ? draft.sector
            : BUSINESS_SECTORS[0],
        );
        setOtherSector(draft?.otherSector ?? "");
        setContactName(draft?.contactName ?? appUser?.display_name ?? "");
        setPhone(
          draft?.phone ??
            normaliseInternationalPhoneNumber(appUser?.phone ?? "") ??
            appUser?.phone ??
            "",
        );
        setAddressLine1(draft?.addressLine1 ?? "");
        setCity(draft?.city ?? "");
        setPostcode(draft?.postcode ?? "");
        setDescription(draft?.description ?? "");
      }

      if (!profile && draft) {
        setLegalAccepted(Boolean(draft.legalAccepted));
      }

      setExistingDocuments(
        ((businessDocuments as BusinessDocumentRecord[] | null) ?? []).reduce<
          Partial<Record<BusinessDocumentType, BusinessDocumentRecord>>
        >((accumulator, document) => {
          accumulator[document.document_type] = document;
          return accumulator;
        }, {}),
      );

      setLoading(false);
      setDraftRestored(true);
    };

    void hydrateForm();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (mode !== "onboarding" || !draftKey || !draftRestored || loading) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      writeOnboardingDraft<BusinessOnboardingDraft>(draftKey, {
        businessName,
        sector: sector || "",
        otherSector,
        contactName,
        phone,
        addressLine1,
        city,
        postcode,
        description,
        legalAccepted,
      });
    }, 300);

    return () => window.clearTimeout(timeoutId);
  }, [
    addressLine1,
    businessName,
    city,
    contactName,
    description,
    draftKey,
    draftRestored,
    legalAccepted,
    loading,
    mode,
    otherSector,
    phone,
    postcode,
    sector,
  ]);

  const completion = useMemo(
    () =>
      calculateBusinessProfileCompletion({
        user_id: user?.id ?? "",
        business_name: businessName,
        sector: sector === "Other" ? otherSector.trim() : sector || "",
        contact_name: contactName || null,
        phone: phone || null,
        address_line_1: addressLine1,
        city,
        postcode: postcode || null,
        description: description || null,
        verification_status: approvalStatus,
        created_at: "",
        updated_at: "",
      }),
    [
      addressLine1,
      approvalStatus,
      businessName,
      city,
      contactName,
      description,
      otherSector,
      phone,
      postcode,
      sector,
      user?.id,
    ],
  );

  const validate = () => {
    if (!businessName.trim()) return "Business name is required.";
    if (!sector) return "Business sector is required.";
    if (sector === "Other" && !otherSector.trim()) return "Enter your business sector.";
    if (!contactName.trim()) return "Contact name is required.";
    if (phone.trim() && !normaliseInternationalPhoneNumber(phone)) {
      return "Enter the contact phone in international format, for example +447700900123.";
    }
    if (!addressLine1.trim()) return "Address is required.";
    if (!city.trim()) return "City is required.";
    if (!description.trim()) return "Business description is required.";
    if (mode === "onboarding" && !legalAccepted) {
      return "You need to accept Terms and Privacy before completing onboarding.";
    }
    return null;
  };

  const handleDocumentChange = (
    documentType: BusinessDocumentType,
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0] ?? null;
    setDocuments((current) => ({ ...current, [documentType]: file }));
  };

  const handleViewDocument = async (documentType: BusinessDocumentType) => {
    const document = existingDocuments[documentType];

    if (!document) {
      return;
    }

    setViewingDocumentType(documentType);

    try {
      const { data, error } = await supabase.storage
        .from(document.storage_bucket)
        .createSignedUrl(document.storage_path, 60);

      if (error || !data?.signedUrl) {
        throw new Error(formatSupabaseError(error));
      }

      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch (nextError) {
      setMessage(
        nextError instanceof Error
          ? nextError.message
          : "We could not open this document right now.",
      );
    } finally {
      setViewingDocumentType(null);
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const validationError = validate();
    setMessage(validationError);
    if (validationError) return;

    setSaving(true);

    try {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();

      if (!authUser) {
        router.replace("/login");
        return;
      }

      const { data: existingProfile, error: existingProfileError } = await supabase
        .from("business_profiles")
        .select("user_id")
        .eq("user_id", authUser.id)
        .maybeSingle();

      if (existingProfileError) {
        throw new Error(formatSupabaseError(existingProfileError));
      }

      const verificationDocument = documents.verification_document;
      const nextApprovalStatus =
        verificationDocument && approvalStatus !== "verified" ? "pending" : approvalStatus;
      const acceptedAt = new Date().toISOString();

      const businessProfilePayload = {
        user_id: authUser.id,
        business_name: businessName.trim(),
        sector: sector === "Other" ? otherSector.trim() : sector,
        contact_name: contactName.trim(),
        phone: normaliseInternationalPhoneNumber(phone),
        address_line_1: addressLine1.trim(),
        city: city.trim(),
        postcode: postcode.trim() || null,
        description: description.trim(),
        verification_status: nextApprovalStatus,
      };

      const [{ error: userError }, { error: profileError }] = await Promise.all([
        supabase
          .from("users")
          .update({
            display_name: contactName.trim(),
            phone: normaliseInternationalPhoneNumber(phone),
            role: "business",
            role_selected: true,
            onboarding_complete: true,
            ...(mode === "onboarding"
              ? {
                  terms_accepted_at: legalAccepted ? acceptedAt : null,
                  terms_version: legalAccepted ? CURRENT_TERMS_VERSION : null,
                  privacy_accepted_at: legalAccepted ? acceptedAt : null,
                  privacy_version: legalAccepted ? CURRENT_PRIVACY_VERSION : null,
                }
              : {}),
          })
          .eq("id", authUser.id),
        existingProfile
          ? supabase
              .from("business_profiles")
              .update(businessProfilePayload)
              .eq("user_id", authUser.id)
          : supabase.from("business_profiles").insert(businessProfilePayload),
      ]);

      if (userError || profileError) {
        throw new Error(formatSupabaseError(userError ?? profileError));
      }

      if (verificationDocument) {
        const path = `${authUser.id}/verification-document-${Date.now()}-${sanitiseFileName(
          verificationDocument.name,
        )}`;

        const { error: uploadError } = await supabase.storage
          .from("business-documents")
          .upload(path, verificationDocument, { upsert: true });

        if (uploadError) {
          throw new Error(formatSupabaseError(uploadError));
        }

        const { data: savedDocument, error: documentError } = await supabase
          .from("business_documents")
          .upsert(
            {
              business_id: authUser.id,
              document_type: "verification_document",
              file_name: verificationDocument.name,
              storage_bucket: "business-documents",
              storage_path: path,
            },
            { onConflict: "business_id,document_type" },
          )
          .select("*")
          .single<BusinessDocumentRecord>();

        if (documentError) {
          throw new Error(formatSupabaseError(documentError));
        }

        setExistingDocuments((current) => ({
          ...current,
          verification_document: savedDocument,
        }));
        setDocuments({});
        setApprovalStatus(nextApprovalStatus);
      }

      await refreshAuthState();
      if (mode === "onboarding" && draftKey) {
        clearOnboardingDraft(draftKey);
      }

      showToast({
        title: mode === "onboarding" ? "Business profile ready" : "Business profile saved",
        description:
          mode === "onboarding"
            ? "You can now move into business discovery."
            : "Your venue details are live and updated.",
        tone: "success",
      });

      setMessage(
        mode === "onboarding"
          ? "Business profile completed."
          : "Business profile saved successfully.",
      );

      if (mode === "onboarding") {
        console.info("[auth] redirect decision", {
          reason: "business-onboarding-complete",
          pathname: "/profile/setup/business",
          hasSession: true,
          authUserId: authUser.id,
          role: "business",
          target: "/dashboard/business",
        });
        router.push("/dashboard/business");
      } else {
        router.refresh();
      }
    } catch (error) {
      const nextMessage =
        error instanceof Error ? error.message : "Unable to save your business profile.";
      setMessage(nextMessage);
      showToast({
        title: "Business profile error",
        description: nextMessage,
        tone: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-black px-4 py-10 pb-36 sm:pb-28">
      <div className="panel mx-auto max-w-4xl p-5 sm:p-8">
        <NexHyrLogo className="mb-5" />
        {mode === "onboarding" ? (
          <OnboardingProgress role="business" step="profile" />
        ) : null}
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="section-label">
              {mode === "onboarding" ? "Business onboarding" : "Business profile"}
            </p>
            <h1 className="mt-4 text-2xl font-semibold text-stone-900 sm:text-3xl">
              {mode === "onboarding"
                ? "Set up your business profile"
                : "Manage your business profile"}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-600">
              Keep your venue details current so businesses can search workers with
              confidence and workers can understand your environment.
            </p>
            {mode === "onboarding" ? (
              <p className="mt-2 text-xs text-stone-500">
                Your progress is saved on this device.
              </p>
            ) : null}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="panel-soft px-4 py-3">
              <p className="text-xs uppercase tracking-[0.2em] text-stone-500">
                Profile completion
              </p>
              <p className="mt-2 text-2xl font-semibold text-stone-900">{completion}%</p>
            </div>
            <div className="panel-soft px-4 py-3">
              <p className="text-xs uppercase tracking-[0.2em] text-stone-500">
                Approval status
              </p>
              <span className={`mt-2 inline-flex rounded-full px-3 py-1 text-sm font-medium ${statusStyles(approvalStatus)}`}>
                {approvalStatus}
              </span>
              <p className="mt-2 text-xs leading-5 text-stone-500">
                {statusCopy(approvalStatus)}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-6 h-2 w-full overflow-hidden rounded-full bg-stone-200">
          <div className="h-full rounded-full bg-stone-900" style={{ width: `${completion}%` }} />
        </div>

        <form onSubmit={handleSubmit} className="mt-8 grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="mb-2 block text-sm font-medium text-stone-700">
              Business name
            </label>
            <input value={businessName} onChange={(e) => setBusinessName(e.target.value)} className="input" placeholder="The Railway Arms" required />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-stone-700">
              Business sector
            </label>
            <select
              value={sector}
              onChange={(e) => setSector(e.target.value as BusinessSector)}
              className="input"
            >
              <option value="">Select a sector</option>
              {BUSINESS_SECTORS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>

          {sector === "Other" ? (
            <div>
              <label className="mb-2 block text-sm font-medium text-stone-700">
                Your sector
              </label>
              <input
                value={otherSector}
                onChange={(e) => setOtherSector(e.target.value)}
                className="input"
                placeholder="Private members club"
                required
              />
            </div>
          ) : null}

          <div>
            <label className="mb-2 block text-sm font-medium text-stone-700">
              Contact name
            </label>
            <input value={contactName} onChange={(e) => setContactName(e.target.value)} className="input" placeholder="General manager" required />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-stone-700">
              Contact phone
            </label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onBlur={(event) => {
                const normalised = normaliseInternationalPhoneNumber(event.target.value);
                if (normalised) {
                  setPhone(normalised);
                }
              }}
              className="input"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="+447700900123"
            />
            <p className="mt-2 text-xs text-stone-500">
              Use international format so booking and reminder messages can be delivered reliably.
            </p>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-stone-700">
              Contact email
            </label>
            <input value={user?.email ?? ""} className="input" disabled readOnly />
          </div>

          <div className="md:col-span-2">
            <AddressAutocomplete
              label="Find your venue address"
              placeholder="Start typing your venue address or postcode"
              helperText="Search and pick your venue address, then adjust any field below if needed."
              selectionDisplay="addressLine1"
              onSelect={(suggestion) => {
                setAddressLine1(suggestion.addressLine1 || "");
                setCity(suggestion.city || "");
                setPostcode(suggestion.postcode || "");
              }}
            />
          </div>

          <div className="md:col-span-2">
            <label className="mb-2 block text-sm font-medium text-stone-700">
              Address
            </label>
            <input value={addressLine1} onChange={(e) => setAddressLine1(e.target.value)} className="input" placeholder="Venue address" required />
            <p className="mt-2 text-xs text-stone-500">
              Keep this editable so you can refine the address after choosing a search result.
            </p>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-stone-700">
              City
            </label>
            <input value={city} onChange={(e) => setCity(e.target.value)} className="input" placeholder="Leeds" required />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-stone-700">
              Postcode
            </label>
            <input value={postcode} onChange={(e) => setPostcode(e.target.value)} className="input" placeholder="LS1..." />
          </div>

          <div className="md:col-span-2">
            <label className="mb-2 block text-sm font-medium text-stone-700">
              Business description
            </label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="input min-h-32 resize-y" placeholder="Describe your venue, service style, team culture, and staffing needs." required />
          </div>

          <div className="md:col-span-2 rounded-[2rem] border border-white/10 bg-black/35 p-4 sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-stone-100">Trusted business badge</p>
                  <p className="mt-1 text-sm leading-6 text-stone-400">
                    Upload one company document so admin can approve your profile and turn on the green trusted tick for workers.
                  </p>
                </div>
                <span
                  className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${
                    approvalStatus === "verified"
                      ? "bg-[#1DB954] text-white"
                      : "border border-[#67B7FF]/30 bg-[#14203A] text-[#CFE6FF]"
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`flex h-4 w-4 items-center justify-center rounded-full ${
                      approvalStatus === "verified"
                        ? "bg-white/20 text-white"
                        : "bg-[#67B7FF]/20 text-[#67B7FF]"
                    }`}
                  >
                    <svg viewBox="0 0 16 16" className="h-3 w-3 fill-none stroke-current stroke-[2.2]">
                      <path d="M3.5 8.4 6.5 11.2 12.5 4.8" />
                    </svg>
                  </span>
                  {approvalStatus === "verified" ? "Verified" : "In review"}
                </span>
              </div>

            <label
              htmlFor="business-verification-document"
              className="mt-4 block cursor-pointer rounded-[1.5rem] border border-white/10 bg-[rgba(12,21,40,0.92)] p-4 transition hover:border-[#67B7FF]/40 hover:bg-[rgba(17,31,58,0.94)]"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-stone-100">
                    {BUSINESS_DOCUMENT_LABELS.verification_document}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-stone-400">
                    Use a company document you are happy for admin to review.
                  </p>
                </div>
                {existingDocuments.verification_document ? (
                  <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-900">
                    Uploaded
                  </span>
                ) : (
                  <span className="rounded-full border border-[#67B7FF]/30 bg-[#14203A] px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-[#CFE6FF]">
                    Review
                  </span>
                )}
              </div>
                <div className="mt-4">
                  <input
                    id="business-verification-document"
                    type="file"
                    onChange={(event) => handleDocumentChange("verification_document", event)}
                  className="sr-only"
                />
                <div className="inline-flex items-center rounded-full bg-[#1DB954] px-4 py-2 text-sm font-semibold text-white">
                  {documents.verification_document || existingDocuments.verification_document
                    ? "Change file"
                    : "Add file"}
                </div>
                  <p className="mt-2 text-xs text-stone-400">
                    {documents.verification_document?.name ||
                      existingDocuments.verification_document?.file_name ||
                      "No file selected"}
                  </p>
                  {existingDocuments.verification_document ? (
                    <button
                      type="button"
                      onClick={() => void handleViewDocument("verification_document")}
                      disabled={viewingDocumentType === "verification_document"}
                      className="mt-3 inline-flex items-center rounded-full border border-[#67B7FF]/30 bg-[#14203A] px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#CFE6FF] transition hover:border-[#67B7FF]/50 hover:bg-[#18294a] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {viewingDocumentType === "verification_document" ? "Opening..." : "View document"}
                    </button>
                  ) : null}
                </div>
              </label>
            </div>

          {message ? (
            <p className="info-banner md:col-span-2">
              {message}
            </p>
          ) : null}

          <div className="md:col-span-2 hidden gap-3 sm:flex sm:flex-row sm:flex-wrap">
            <button type="submit" className="primary-btn w-full px-8 sm:w-auto" disabled={loading || saving}>
              {saving
                ? "Saving business profile..."
                : mode === "onboarding"
                  ? "Complete business profile"
                  : "Save changes"}
            </button>
            {mode === "manage" ? (
              <button
                type="button"
                onClick={() => router.push("/dashboard/business")}
                className="secondary-btn w-full px-6 sm:w-auto"
              >
                Back to dashboard
              </button>
            ) : null}
          </div>

          {mode === "onboarding" ? (
            <label className="md:col-span-2 flex items-start gap-3 rounded-2xl border border-white/10 bg-black/30 p-4">
              <input
                type="checkbox"
                checked={legalAccepted}
                onChange={(event) => setLegalAccepted(event.target.checked)}
                className="mt-1 h-4 w-4"
              />
              <span className="text-sm leading-6 text-stone-700">
                I agree to the NexHyr{" "}
                <a href="/terms" target="_blank" rel="noreferrer" className="underline">
                  Terms & Conditions
                </a>{" "}
                and{" "}
                <a href="/privacy" target="_blank" rel="noreferrer" className="underline">
                  Privacy Policy
                </a>
                .
              </span>
            </label>
          ) : null}
        </form>
      </div>
      <div className={`sticky z-20 mt-6 rounded-[1.5rem] border border-white/10 bg-[rgba(4,12,22,0.94)] p-4 shadow-[0_16px_34px_rgba(0,0,0,0.24)] backdrop-blur-xl sm:hidden ${mode === "manage" ? "bottom-24" : "bottom-4"}`}>
        <div className="flex flex-col gap-3">
          <button type="button" onClick={() => {
            const form = document.querySelector("form");
            form?.requestSubmit();
          }} className="primary-btn w-full" disabled={loading || saving}>
            {saving
              ? "Saving business profile..."
              : mode === "onboarding"
                ? "Complete business profile"
                : "Save changes"}
          </button>
          {mode === "manage" ? (
            <button
              type="button"
              onClick={() => router.push("/dashboard/business")}
              className="secondary-btn w-full"
            >
              Back to dashboard
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
