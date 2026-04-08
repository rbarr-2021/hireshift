"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  BUSINESS_SECTORS,
  type BusinessProfileRecord,
  type BusinessSector,
  type UserRecord,
} from "@/lib/models";
import { calculateBusinessProfileCompletion } from "@/lib/business-discovery";

type BusinessProfileFormProps = {
  mode: "onboarding" | "manage";
};

function statusStyles(status: BusinessProfileRecord["verification_status"] | "pending") {
  if (status === "verified") return "bg-emerald-100 text-emerald-900";
  if (status === "rejected") return "bg-red-100 text-red-900";
  return "bg-amber-100 text-amber-900";
}

export function BusinessProfileForm({ mode }: BusinessProfileFormProps) {
  const router = useRouter();
  const [user, setUser] = useState<UserRecord | null>(null);
  const [businessName, setBusinessName] = useState("");
  const [sector, setSector] = useState<BusinessSector | "">(BUSINESS_SECTORS[0]);
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [city, setCity] = useState("");
  const [postcode, setPostcode] = useState("");
  const [description, setDescription] = useState("");
  const [approvalStatus, setApprovalStatus] =
    useState<BusinessProfileRecord["verification_status"]>("pending");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const hydrateForm = async () => {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();

      if (!authUser || !active) {
        return;
      }

      const [{ data: appUser }, { data: profile }] = await Promise.all([
        supabase.from("users").select("*").eq("id", authUser.id).maybeSingle<UserRecord>(),
        supabase
          .from("business_profiles")
          .select("*")
          .eq("user_id", authUser.id)
          .maybeSingle<BusinessProfileRecord>(),
      ]);

      if (!active) return;

      setUser(appUser ?? null);

      if (profile) {
        setBusinessName(profile.business_name);
        setSector(profile.sector as BusinessSector);
        setContactName(profile.contact_name ?? appUser?.display_name ?? "");
        setPhone(profile.phone ?? appUser?.phone ?? "");
        setAddressLine1(profile.address_line_1);
        setCity(profile.city);
        setPostcode(profile.postcode ?? "");
        setDescription(profile.description ?? "");
        setApprovalStatus(profile.verification_status);
      } else {
        setContactName(appUser?.display_name ?? "");
        setPhone(appUser?.phone ?? "");
      }

      setLoading(false);
    };

    void hydrateForm();

    return () => {
      active = false;
    };
  }, []);

  const completion = useMemo(
    () =>
      calculateBusinessProfileCompletion({
        user_id: user?.id ?? "",
        business_name: businessName,
        sector: sector || "",
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
      phone,
      postcode,
      sector,
      user?.id,
    ],
  );

  const validate = () => {
    if (!businessName.trim()) return "Business name is required.";
    if (!sector) return "Business sector is required.";
    if (!contactName.trim()) return "Contact name is required.";
    if (!addressLine1.trim()) return "Address is required.";
    if (!city.trim()) return "City is required.";
    if (!description.trim()) return "Business description is required.";
    return null;
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

      const [{ error: userError }, { error: profileError }] = await Promise.all([
        supabase
          .from("users")
          .update({
            display_name: contactName.trim(),
            phone: phone.trim() || null,
            role: "business",
            onboarding_complete: true,
          })
          .eq("id", authUser.id),
        supabase.from("business_profiles").upsert({
          user_id: authUser.id,
          business_name: businessName.trim(),
          sector,
          contact_name: contactName.trim(),
          phone: phone.trim() || null,
          address_line_1: addressLine1.trim(),
          city: city.trim(),
          postcode: postcode.trim() || null,
          description: description.trim(),
        }),
      ]);

      if (userError || profileError) {
        throw userError ?? profileError;
      }

      setMessage(
        mode === "onboarding"
          ? "Business profile completed."
          : "Business profile saved successfully.",
      );

      if (mode === "onboarding") {
        router.push("/dashboard/business");
      } else {
        router.refresh();
      }
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to save your business profile.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-stone-100 px-4 py-10">
      <div className="mx-auto max-w-4xl rounded-[2rem] border border-stone-200 bg-white p-8 shadow-sm">
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-amber-700">
              {mode === "onboarding" ? "Business onboarding" : "Business profile"}
            </p>
            <h1 className="mt-4 text-3xl font-semibold text-stone-900">
              {mode === "onboarding"
                ? "Set up your business profile"
                : "Manage your business profile"}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-600">
              Keep your venue details current so businesses can search workers with
              confidence and workers can understand your environment.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl bg-stone-100 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.2em] text-stone-500">
                Profile completion
              </p>
              <p className="mt-2 text-2xl font-semibold text-stone-900">{completion}%</p>
            </div>
            <div className="rounded-2xl bg-stone-100 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.2em] text-stone-500">
                Approval status
              </p>
              <span className={`mt-2 inline-flex rounded-full px-3 py-1 text-sm font-medium ${statusStyles(approvalStatus)}`}>
                {approvalStatus}
              </span>
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
            <select value={sector} onChange={(e) => setSector(e.target.value as BusinessSector)} className="input">
              <option value="">Select a sector</option>
              {BUSINESS_SECTORS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>

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
            <input value={phone} onChange={(e) => setPhone(e.target.value)} className="input" placeholder="+44..." />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-stone-700">
              Contact email
            </label>
            <input value={user?.email ?? ""} className="input" disabled readOnly />
          </div>

          <div className="md:col-span-2">
            <label className="mb-2 block text-sm font-medium text-stone-700">
              Address
            </label>
            <input value={addressLine1} onChange={(e) => setAddressLine1(e.target.value)} className="input" placeholder="Venue address" required />
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

          {message ? (
            <p className="md:col-span-2 rounded-2xl bg-stone-100 px-4 py-3 text-sm text-stone-700">
              {message}
            </p>
          ) : null}

          <div className="md:col-span-2 flex flex-wrap gap-3">
            <button type="submit" className="primary-btn px-8" disabled={loading || saving}>
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
                className="rounded-2xl border border-stone-300 px-6 py-3 text-sm font-medium text-stone-700 transition hover:bg-stone-100"
              >
                Back to dashboard
              </button>
            ) : null}
          </div>
        </form>
      </div>
    </div>
  );
}
