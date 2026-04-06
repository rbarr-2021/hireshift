"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthGuard } from "@/components/auth/auth-guard";
import { supabase } from "@/lib/supabase";
import {
  BUSINESS_SECTORS,
  type BusinessSector,
  type BusinessProfileRecord,
  type UserRecord,
} from "@/lib/models";

export default function BusinessSetup() {
  const router = useRouter();
  const [businessName, setBusinessName] = useState("");
  const [sector, setSector] = useState<BusinessSector>(BUSINESS_SECTORS[0]);
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [city, setCity] = useState("");
  const [postcode, setPostcode] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const hydrateForm = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user || !active) {
        return;
      }

      const [{ data: appUser }, { data: profile }] = await Promise.all([
        supabase.from("users").select("*").eq("id", user.id).maybeSingle<UserRecord>(),
        supabase
          .from("business_profiles")
          .select("*")
          .eq("user_id", user.id)
          .maybeSingle<BusinessProfileRecord>(),
      ]);

      if (!active) {
        return;
      }

      if (appUser?.display_name) {
        setContactName(appUser.display_name);
      }

      if (appUser?.phone) {
        setPhone(appUser.phone);
      }

      if (profile) {
        setBusinessName(profile.business_name);
        setSector(profile.sector as BusinessSector);
        setContactName(profile.contact_name ?? appUser?.display_name ?? "");
        setPhone(profile.phone ?? appUser?.phone ?? "");
        setAddressLine1(profile.address_line_1);
        setCity(profile.city);
        setPostcode(profile.postcode ?? "");
        setDescription(profile.description ?? "");
      }
    };

    void hydrateForm();

    return () => {
      active = false;
    };
  }, []);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);

    if (!businessName || !sector || !addressLine1 || !city) {
      setMessage("Business name, sector, address, and city are required for Phase 1.");
      return;
    }

    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setLoading(false);
      setMessage("Your session has expired. Please log in again.");
      router.replace("/login");
      return;
    }

    const [{ error: userError }, { error: profileError }] = await Promise.all([
      supabase
        .from("users")
        .update({
          display_name: contactName || businessName,
          phone: phone || null,
          role: "business",
          onboarding_complete: true,
        })
        .eq("id", user.id),
      supabase.from("business_profiles").upsert({
        user_id: user.id,
        business_name: businessName,
        sector,
        contact_name: contactName || null,
        phone: phone || null,
        address_line_1: addressLine1,
        city,
        postcode: postcode || null,
        description: description || null,
      }),
    ]);

    setLoading(false);

    const error = userError ?? profileError;

    if (error) {
      setMessage(error.message);
      return;
    }

    router.push("/dashboard/business");
  };

  return (
    <AuthGuard>
      <div className="min-h-screen bg-stone-100 px-4 py-10">
        <div className="mx-auto max-w-3xl rounded-[2rem] border border-stone-200 bg-white p-8 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-amber-700">
            Business onboarding
          </p>
          <h1 className="mt-4 text-3xl font-semibold text-stone-900">
            Set up your business profile
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-600">
            We’re capturing the minimum details needed to support business
            identity, future worker search, bookings, and payments.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-medium text-stone-700">
                Business name
              </label>
              <input
                value={businessName}
                onChange={(event) => setBusinessName(event.target.value)}
                className="input"
                placeholder="The Railway Arms"
                required
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-stone-700">
                Sector
              </label>
              <select
                value={sector}
                onChange={(event) => setSector(event.target.value as BusinessSector)}
                className="input"
              >
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
              <input
                value={contactName}
                onChange={(event) => setContactName(event.target.value)}
                className="input"
                placeholder="General manager"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-stone-700">
                Contact phone
              </label>
              <input
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                className="input"
                placeholder="+44..."
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-stone-700">
                City
              </label>
              <input
                value={city}
                onChange={(event) => setCity(event.target.value)}
                className="input"
                placeholder="Leeds"
                required
              />
            </div>

            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-medium text-stone-700">
                Address line 1
              </label>
              <input
                value={addressLine1}
                onChange={(event) => setAddressLine1(event.target.value)}
                className="input"
                placeholder="Venue address"
                required
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-stone-700">
                Postcode
              </label>
              <input
                value={postcode}
                onChange={(event) => setPostcode(event.target.value)}
                className="input"
                placeholder="LS1..."
              />
            </div>

            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-medium text-stone-700">
                Business description
              </label>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                className="input min-h-32 resize-y"
                placeholder="Tell workers about your venue, shift environment, and staffing needs."
              />
            </div>

            {message ? (
              <p className="md:col-span-2 rounded-2xl bg-stone-100 px-4 py-3 text-sm text-stone-700">
                {message}
              </p>
            ) : null}

            <div className="md:col-span-2 flex flex-wrap gap-3">
              <button type="submit" className="primary-btn px-8" disabled={loading}>
                {loading ? "Saving business profile..." : "Save business profile"}
              </button>
              <button
                type="button"
                onClick={() => router.push("/dashboard")}
                className="rounded-2xl border border-stone-300 px-6 py-3 text-sm font-medium text-stone-700 transition hover:bg-stone-100"
              >
                Skip for now
              </button>
            </div>
          </form>
        </div>
      </div>
    </AuthGuard>
  );
}
