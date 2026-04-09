"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  APPROVAL_STATUSES,
  DOCUMENT_LABELS,
  DOCUMENT_TYPES,
  HOSPITALITY_ROLES,
  HOSPITALITY_SKILLS,
  WEEK_DAYS,
  type ApprovalStatus,
  type HospitalityRole,
  type DocumentType,
  type UserRecord,
  type WorkHistoryItem,
  type WorkerAvailabilitySlotRecord,
  type WorkerDocumentRecord,
  type WorkerProfileRecord,
} from "@/lib/models";

type WorkerProfileFormProps = {
  mode: "onboarding" | "manage";
};

type AvailabilityDayState = {
  enabled: boolean;
  start: string;
  end: string;
};

type AvailabilityState = Record<number, AvailabilityDayState>;
type DocumentFileState = Partial<Record<DocumentType, File | null>>;
type WorkerSaveStage =
  | "auth"
  | "users"
  | "worker_profiles"
  | "worker-profile-assets"
  | "worker_availability_slots"
  | "worker_documents"
  | "worker-document-storage";

type SupabaseLikeError = {
  message?: string;
  details?: string | null;
  hint?: string | null;
  code?: string;
};

const EMPTY_WORK_HISTORY: WorkHistoryItem = {
  venue: "",
  role: "",
  startYear: "",
  endYear: "",
  summary: "",
};

function createInitialAvailability(): AvailabilityState {
  return WEEK_DAYS.reduce<AvailabilityState>((accumulator, day) => {
    accumulator[day.key] = { enabled: false, start: "09:00", end: "17:00" };
    return accumulator;
  }, {} as AvailabilityState);
}

function sanitiseFileName(value: string) {
  return value.replace(/[^a-zA-Z0-9.-]/g, "-").toLowerCase();
}

function approvalStyles(status: ApprovalStatus) {
  const styles: Record<ApprovalStatus, string> = {
    pending: "bg-amber-100 text-amber-900",
    verified: "bg-emerald-100 text-emerald-900",
    rejected: "bg-red-100 text-red-900",
  };
  return styles[status];
}

function approvalLabel(status: ApprovalStatus) {
  const labels: Record<ApprovalStatus, string> = {
    pending: "Pending review",
    verified: "Approved",
    rejected: "Changes required",
  };
  return labels[status];
}

function buildAvailabilityState(
  slots: WorkerAvailabilitySlotRecord[] | null,
): AvailabilityState {
  const nextState = createInitialAvailability();

  (slots ?? []).forEach((slot) => {
    nextState[slot.day_of_week] = {
      enabled: true,
      start: slot.start_time.slice(0, 5),
      end: slot.end_time.slice(0, 5),
    };
  });

  return nextState;
}

function normaliseWorkHistory(value: WorkHistoryItem[] | null | undefined) {
  const base = value && value.length > 0 ? value : [EMPTY_WORK_HISTORY];
  return [...base, EMPTY_WORK_HISTORY].slice(0, 3);
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

  return "Unknown worker profile save error.";
}

function createWorkerSaveError(stage: WorkerSaveStage, error: unknown) {
  const detail = formatSupabaseError(error);
  const nextError = new Error(`Save failed at ${stage}: ${detail}`);
  console.error("[worker-profile-save]", { stage, detail, error });
  return nextError;
}

export function WorkerProfileForm({ mode }: WorkerProfileFormProps) {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [jobRole, setJobRole] = useState<HospitalityRole>(HOSPITALITY_ROLES[0]);
  const [bio, setBio] = useState("");
  const [skills, setSkills] = useState<string[]>([]);
  const [customSkill, setCustomSkill] = useState("");
  const [hourlyRate, setHourlyRate] = useState<string>("");
  const [dailyRate, setDailyRate] = useState<string>("");
  const [yearsExperience, setYearsExperience] = useState<string>("");
  const [city, setCity] = useState("");
  const [postcode, setPostcode] = useState("");
  const [travelRadius, setTravelRadius] = useState<string>("10");
  const [availabilitySummary, setAvailabilitySummary] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [workHistory, setWorkHistory] = useState<WorkHistoryItem[]>(
    normaliseWorkHistory(undefined),
  );
  const [availability, setAvailability] = useState<AvailabilityState>(
    createInitialAvailability(),
  );
  const [documents, setDocuments] = useState<DocumentFileState>({});
  const [existingDocuments, setExistingDocuments] = useState<
    Partial<Record<DocumentType, WorkerDocumentRecord>>
  >({});
  const [approvalStatus, setApprovalStatus] = useState<ApprovalStatus>("pending");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const loadProfile = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user || !active) {
        return;
      }

      const [appUserResult, profileResult, availabilityResult, documentsResult] =
        await Promise.all([
          supabase.from("users").select("*").eq("id", user.id).maybeSingle<UserRecord>(),
          supabase
            .from("worker_profiles")
            .select("*")
            .eq("user_id", user.id)
            .maybeSingle<WorkerProfileRecord>(),
          supabase
            .from("worker_availability_slots")
            .select("*")
            .eq("worker_id", user.id)
            .order("day_of_week", { ascending: true })
            .order("start_time", { ascending: true }),
          supabase.from("worker_documents").select("*").eq("worker_id", user.id),
        ]);

      if (!active) {
        return;
      }

      const appUser = appUserResult.data;
      const profile = profileResult.data;
      const availabilitySlots =
        (availabilityResult.data as WorkerAvailabilitySlotRecord[] | null) ?? [];
      const workerDocuments =
        (documentsResult.data as WorkerDocumentRecord[] | null) ?? [];

      if (appUser?.display_name) {
        setFullName(appUser.display_name);
      }

      if (profile) {
        setJobRole(profile.job_role as HospitalityRole);
        setBio(profile.bio ?? "");
        setSkills(profile.skills ?? []);
        setHourlyRate(
          profile.hourly_rate_gbp !== null ? String(profile.hourly_rate_gbp) : "",
        );
        setDailyRate(
          profile.daily_rate_gbp !== null ? String(profile.daily_rate_gbp) : "",
        );
        setYearsExperience(String(profile.years_experience ?? ""));
        setCity(profile.city);
        setPostcode(profile.postcode ?? "");
        setTravelRadius(String(profile.travel_radius_miles));
        setAvailabilitySummary(profile.availability_summary ?? "");
        setPhotoUrl(profile.profile_photo_url);
        setPhotoPath(profile.profile_photo_path);
        setWorkHistory(normaliseWorkHistory(profile.work_history));
        setApprovalStatus(profile.verification_status);
      }

      setAvailability(buildAvailabilityState(availabilitySlots));
      setExistingDocuments(
        workerDocuments.reduce<Partial<Record<DocumentType, WorkerDocumentRecord>>>(
          (accumulator, document) => {
            accumulator[document.document_type] = document;
            return accumulator;
          },
          {},
        ),
      );
      setLoading(false);
    };

    void loadProfile();

    return () => {
      active = false;
    };
  }, []);

  const selectedAvailabilityCount = useMemo(
    () => WEEK_DAYS.filter((day) => availability[day.key].enabled).length,
    [availability],
  );

  const uploadedDocumentCount = useMemo(
    () =>
      DOCUMENT_TYPES.filter(
        (documentType) => existingDocuments[documentType] || documents[documentType],
      ).length,
    [documents, existingDocuments],
  );

  const completion = useMemo(() => {
    const completedChecks = [
      fullName.trim().length > 0,
      bio.trim().length >= 60,
      jobRole.trim().length > 0,
      skills.length >= 2,
      hourlyRate.trim().length > 0 || dailyRate.trim().length > 0,
      yearsExperience.trim().length > 0,
      city.trim().length > 0,
      travelRadius.trim().length > 0,
      selectedAvailabilityCount > 0,
      workHistory.some((item) => item.venue.trim() && item.role.trim()),
      Boolean(photoUrl || photoFile),
    ];

    const score = completedChecks.filter(Boolean).length;
    return Math.round((score / completedChecks.length) * 100);
  }, [
    bio,
    city,
    dailyRate,
    fullName,
    hourlyRate,
    jobRole,
    photoFile,
    photoUrl,
    selectedAvailabilityCount,
    skills.length,
    travelRadius,
    workHistory,
    yearsExperience,
  ]);

  const addCustomSkill = () => {
    const nextSkill = customSkill.trim();

    if (!nextSkill || skills.includes(nextSkill)) {
      return;
    }

    setSkills((current) => [...current, nextSkill]);
    setCustomSkill("");
  };

  const updateWorkHistory = (
    index: number,
    field: keyof WorkHistoryItem,
    value: string,
  ) => {
    setWorkHistory((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item,
      ),
    );
  };

  const validateProfile = () => {
    if (!fullName.trim()) return "Full name is required.";
    if (bio.trim().length < 60) return "Bio should be at least 60 characters.";
    if (!jobRole.trim()) return "Select your primary job role.";
    if (skills.length < 2) return "Add at least two skills.";
    if (!hourlyRate.trim() && !dailyRate.trim()) {
      return "Set at least an hourly rate or a daily rate.";
    }
    if (!yearsExperience.trim()) return "Years of experience is required.";
    if (!city.trim()) return "Base location is required.";
    if (!travelRadius.trim()) return "Travel radius is required.";
    if (selectedAvailabilityCount === 0) {
      return "Add at least one availability slot to complete your profile.";
    }

    const invalidAvailability = WEEK_DAYS.some((day) => {
      const slot = availability[day.key];
      return slot.enabled && slot.end <= slot.start;
    });

    if (invalidAvailability) {
      return "Each availability slot must end after it starts.";
    }

    return null;
  };

  const handleDocumentChange = (
    documentType: DocumentType,
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0] ?? null;
    setDocuments((current) => ({ ...current, [documentType]: file }));
  };

  const handlePhotoChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setPhotoFile(file);

    if (file) {
      setPhotoUrl(URL.createObjectURL(file));
    }
  };

  const saveDocuments = async (userId: string) => {
    const uploads = DOCUMENT_TYPES.map(async (documentType) => {
      const file = documents[documentType];

      if (!file) {
        return null;
      }

      const path = `${userId}/${documentType}-${Date.now()}-${sanitiseFileName(file.name)}`;
      console.info("[worker-profile-save] storage upload", {
        stage: "worker-document-storage",
        bucket: "worker-documents",
        path,
        authUserId: userId,
        documentType,
      });
      const { error } = await supabase.storage
        .from("worker-documents")
        .upload(path, file, { upsert: true });

      if (error) {
        throw createWorkerSaveError("worker-document-storage", error);
      }

      return {
        worker_id: userId,
        document_type: documentType,
        file_name: file.name,
        storage_bucket: "worker-documents",
        storage_path: path,
      };
    });

    const nextDocuments = (await Promise.all(uploads)).filter(Boolean);

    if (nextDocuments.length > 0) {
      const { error } = await supabase
        .from("worker_documents")
        .upsert(nextDocuments, { onConflict: "worker_id,document_type" });

      if (error) {
        throw createWorkerSaveError("worker_documents", error);
      }
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const validationError = validateProfile();
    setMessage(validationError);

    if (validationError) {
      return;
    }

    setSaving(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!session || !user) {
        console.error("[worker-profile-save]", {
          stage: "auth",
          sessionPresent: Boolean(session),
          userPresent: Boolean(user),
        });
        setMessage("Your session is no longer valid. Please log in again.");
        router.replace("/login");
        return;
      }

      const { data: appUser, error: appUserError } = await supabase
        .from("users")
        .select("id, role, onboarding_complete")
        .eq("id", user.id)
        .maybeSingle();

      if (appUserError) {
        throw createWorkerSaveError("users", appUserError);
      }

      if (!appUser) {
        throw new Error(
          "Save failed at users: authenticated Supabase user is missing a matching public.users row.",
        );
      }

      let nextPhotoUrl = photoUrl;
      let nextPhotoPath = photoPath;

      if (photoFile) {
        const filePath = `${user.id}/profile-${Date.now()}-${sanitiseFileName(photoFile.name)}`;
        console.info("[worker-profile-save] storage upload", {
          stage: "worker-profile-assets",
          bucket: "worker-profile-assets",
          path: filePath,
          authUserId: user.id,
        });
        const { error: uploadError } = await supabase.storage
          .from("worker-profile-assets")
          .upload(filePath, photoFile, { upsert: true });

        if (uploadError) {
          throw createWorkerSaveError("worker-profile-assets", uploadError);
        }

        nextPhotoPath = filePath;
        nextPhotoUrl = supabase.storage
          .from("worker-profile-assets")
          .getPublicUrl(filePath).data.publicUrl;
      }

      const historyPayload = workHistory.filter(
        (item) => item.venue.trim() || item.role.trim() || item.summary.trim(),
      );

      const availabilityPayload = WEEK_DAYS.filter(
        (day) => availability[day.key].enabled,
      ).map((day) => ({
        worker_id: user.id,
        day_of_week: day.key,
        start_time: availability[day.key].start,
        end_time: availability[day.key].end,
      }));

      const workerProfilePayload = {
        user_id: user.id,
        job_role: jobRole,
        bio: bio.trim(),
        skills,
        hourly_rate_gbp: hourlyRate ? Number(hourlyRate) : null,
        daily_rate_gbp: dailyRate ? Number(dailyRate) : null,
        years_experience: Number(yearsExperience),
        city: city.trim(),
        postcode: postcode.trim() || null,
        travel_radius_miles: Number(travelRadius),
        availability_summary: availabilitySummary.trim() || null,
        profile_photo_url: nextPhotoUrl,
        profile_photo_path: nextPhotoPath,
        work_history: historyPayload,
      };

      console.info("[worker-profile-save] payload", {
        authUserId: user.id,
        appUserId: appUser.id,
        userUpdate: {
          id: user.id,
          role: "worker",
          onboarding_complete: true,
        },
        workerProfilePayload,
        availabilityPayload,
        documentTypes: DOCUMENT_TYPES.filter((documentType) => documents[documentType]),
      });

      const [{ error: userError }, { error: profileError }] = await Promise.all([
        supabase
          .from("users")
          .update({
            display_name: fullName.trim(),
            role: "worker",
            onboarding_complete: true,
          })
          .eq("id", user.id),
        supabase
          .from("worker_profiles")
          .upsert(workerProfilePayload, { onConflict: "user_id" }),
      ]);

      if (userError) {
        throw createWorkerSaveError("users", userError);
      }

      if (profileError) {
        console.error("[worker-profile-save] worker_profiles failure", {
          authUserId: user.id,
          payload: workerProfilePayload,
          error: profileError,
        });
        throw createWorkerSaveError("worker_profiles", profileError);
      }

      const { error: deleteAvailabilityError } = await supabase
        .from("worker_availability_slots")
        .delete()
        .eq("worker_id", user.id);

      if (deleteAvailabilityError) {
        throw createWorkerSaveError(
          "worker_availability_slots",
          deleteAvailabilityError,
        );
      }

      if (availabilityPayload.length > 0) {
        const { error: insertAvailabilityError } = await supabase
          .from("worker_availability_slots")
          .insert(availabilityPayload);

        if (insertAvailabilityError) {
          throw createWorkerSaveError(
            "worker_availability_slots",
            insertAvailabilityError,
          );
        }
      }

      await saveDocuments(user.id);

      setMessage(
        mode === "onboarding"
          ? "Worker profile completed."
          : "Worker profile saved successfully.",
      );

      if (mode === "onboarding") {
        router.push("/dashboard/worker");
      } else {
        router.refresh();
      }
    } catch (error) {
      const nextMessage =
        error instanceof Error ? error.message : "Unable to save your worker profile.";
      setMessage(nextMessage);
    } finally {
      setSaving(false);
    }
  };

  return (
      <div className="min-h-screen bg-stone-100 px-4 py-10">
        <div className="mx-auto max-w-6xl rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm lg:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.3em] text-amber-700">
                {mode === "onboarding" ? "Worker onboarding" : "Worker profile"}
              </p>
              <h1 className="mt-4 text-3xl font-semibold text-stone-900">
                {mode === "onboarding"
                  ? "Create your worker profile"
                  : "Manage your worker profile"}
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-stone-600">
                Build the public-facing profile businesses will use to assess your
                experience, rates, travel range, availability, and supporting
                documents.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:min-w-[280px]">
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
                <span className={`mt-2 inline-flex rounded-full px-3 py-1 text-sm font-medium ${approvalStyles(approvalStatus)}`}>
                  {approvalLabel(approvalStatus)}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-6 h-2 w-full overflow-hidden rounded-full bg-stone-200">
            <div className="h-full rounded-full bg-stone-900" style={{ width: `${completion}%` }} />
          </div>

          <form onSubmit={handleSubmit} className="mt-8 space-y-8">
            <section className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
              <div>
                <h2 className="text-lg font-semibold text-stone-900">Identity</h2>
                <p className="mt-2 text-sm leading-6 text-stone-600">
                  Public-facing name, role, photo, and your about section.
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="md:col-span-2 flex flex-col gap-4 md:flex-row md:items-center">
                  <div className="h-28 w-28 overflow-hidden rounded-3xl bg-stone-100">
                    {photoUrl ? (
                      <Image
                        src={photoUrl}
                        alt="Worker profile preview"
                        className="h-full w-full object-cover"
                        width={112}
                        height={112}
                        unoptimized
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-sm text-stone-500">
                        No photo yet
                      </div>
                    )}
                  </div>
                  <div className="flex-1">
                    <label className="mb-2 block text-sm font-medium text-stone-700">
                      Profile photo
                    </label>
                    <input type="file" accept="image/*" onChange={handlePhotoChange} className="input" />
                    <p className="mt-2 text-xs text-stone-500">
                      Upload a clear headshot or professional profile image.
                    </p>
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-stone-700">
                    Full name
                  </label>
                  <input
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    className="input"
                    placeholder="Your public profile name"
                    required
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-stone-700">
                    Primary job role
                  </label>
                  <select
                    value={jobRole}
                    onChange={(event) => setJobRole(event.target.value as HospitalityRole)}
                    className="input"
                    required
                  >
                    {HOSPITALITY_ROLES.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="mb-2 block text-sm font-medium text-stone-700">
                    Bio / about
                  </label>
                  <textarea
                    value={bio}
                    onChange={(event) => setBio(event.target.value)}
                    className="input min-h-36 resize-y"
                    placeholder="Share your hospitality background, strengths, shift preferences, and guest service style."
                    required
                  />
                  <p className="mt-2 text-xs text-stone-500">
                    Minimum 60 characters so businesses get enough context.
                  </p>
                </div>
              </div>
            </section>

            <section className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
              <div>
                <h2 className="text-lg font-semibold text-stone-900">Skills and rates</h2>
                <p className="mt-2 text-sm leading-6 text-stone-600">
                  Help businesses understand what you do best and how you price your work.
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="md:col-span-2">
                  <label className="mb-2 block text-sm font-medium text-stone-700">
                    Core skills
                  </label>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {HOSPITALITY_SKILLS.map((skill) => {
                      const selected = skills.includes(skill);
                      return (
                        <button
                          key={skill}
                          type="button"
                          onClick={() =>
                            setSkills((current) =>
                              current.includes(skill)
                                ? current.filter((item) => item !== skill)
                                : [...current, skill],
                            )
                          }
                          className={`rounded-2xl border px-4 py-3 text-left text-sm transition ${
                            selected
                              ? "border-stone-900 bg-stone-900 text-white"
                              : "border-stone-200 bg-stone-50 text-stone-700 hover:border-stone-400"
                          }`}
                        >
                          {skill}
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {skills
                      .filter((skill) => !HOSPITALITY_SKILLS.includes(skill as never))
                      .map((skill) => (
                        <span key={skill} className="rounded-full bg-stone-100 px-3 py-1 text-sm text-stone-700">
                          {skill}
                        </span>
                      ))}
                  </div>
                  <div className="mt-3 flex gap-3">
                    <input
                      value={customSkill}
                      onChange={(event) => setCustomSkill(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          addCustomSkill();
                        }
                      }}
                      className="input"
                      placeholder="Add a custom skill"
                    />
                    <button type="button" onClick={addCustomSkill} className="rounded-2xl bg-stone-900 px-5 text-sm font-medium text-white">
                      Add
                    </button>
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-stone-700">
                    Hourly rate (GBP)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="0.50"
                    value={hourlyRate}
                    onChange={(event) => setHourlyRate(event.target.value)}
                    className="input"
                    placeholder="18.50"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-stone-700">
                    Daily rate (GBP)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="0.50"
                    value={dailyRate}
                    onChange={(event) => setDailyRate(event.target.value)}
                    className="input"
                    placeholder="150.00"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-stone-700">
                    Years of experience
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={yearsExperience}
                    onChange={(event) => setYearsExperience(event.target.value)}
                    className="input"
                    placeholder="5"
                    required
                  />
                </div>
              </div>
            </section>

            <section className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
              <div>
                <h2 className="text-lg font-semibold text-stone-900">Experience</h2>
                <p className="mt-2 text-sm leading-6 text-stone-600">
                  Add your recent roles so businesses can see your track record.
                </p>
              </div>
              <div className="space-y-4">
                {workHistory.map((item, index) => (
                  <div key={`history-${index}`} className="rounded-3xl border border-stone-200 bg-stone-50 p-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <label className="mb-2 block text-sm font-medium text-stone-700">Venue / employer</label>
                        <input value={item.venue} onChange={(event) => updateWorkHistory(index, "venue", event.target.value)} className="input" placeholder="Hotel Indigo" />
                      </div>
                      <div>
                        <label className="mb-2 block text-sm font-medium text-stone-700">Role title</label>
                        <input value={item.role} onChange={(event) => updateWorkHistory(index, "role", event.target.value)} className="input" placeholder="Senior Bartender" />
                      </div>
                      <div>
                        <label className="mb-2 block text-sm font-medium text-stone-700">Start year</label>
                        <input value={item.startYear} onChange={(event) => updateWorkHistory(index, "startYear", event.target.value)} className="input" placeholder="2022" />
                      </div>
                      <div>
                        <label className="mb-2 block text-sm font-medium text-stone-700">End year</label>
                        <input value={item.endYear} onChange={(event) => updateWorkHistory(index, "endYear", event.target.value)} className="input" placeholder="Present" />
                      </div>
                      <div className="md:col-span-2">
                        <label className="mb-2 block text-sm font-medium text-stone-700">What did you do there?</label>
                        <textarea value={item.summary} onChange={(event) => updateWorkHistory(index, "summary", event.target.value)} className="input min-h-24 resize-y" placeholder="Shift leadership, stock management, cocktail menu execution..." />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
              <div>
                <h2 className="text-lg font-semibold text-stone-900">Location</h2>
                <p className="mt-2 text-sm leading-6 text-stone-600">
                  Set your base location and how far you are willing to travel.
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <label className="mb-2 block text-sm font-medium text-stone-700">City</label>
                  <input value={city} onChange={(event) => setCity(event.target.value)} className="input" placeholder="Manchester" required />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-stone-700">Postcode</label>
                  <input value={postcode} onChange={(event) => setPostcode(event.target.value)} className="input" placeholder="M1 4..." />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-stone-700">Travel radius (miles)</label>
                  <input type="number" min={0} value={travelRadius} onChange={(event) => setTravelRadius(event.target.value)} className="input" placeholder="12" required />
                </div>
              </div>
            </section>

            <section className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
              <div>
                <h2 className="text-lg font-semibold text-stone-900">Availability</h2>
                <p className="mt-2 text-sm leading-6 text-stone-600">
                  Weekly availability is stored as structured slots so we can power search later.
                </p>
              </div>
              <div className="space-y-4">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  {WEEK_DAYS.map((day) => (
                    <div key={day.key} className="rounded-3xl border border-stone-200 bg-stone-50 p-4">
                      <div className="flex items-center justify-between">
                        <p className="text-base font-semibold text-stone-900">{day.label}</p>
                        <input
                          type="checkbox"
                          checked={availability[day.key].enabled}
                          onChange={(event) =>
                            setAvailability((current) => ({
                              ...current,
                              [day.key]: { ...current[day.key], enabled: event.target.checked },
                            }))
                          }
                        />
                      </div>
                      <div className="mt-4 grid gap-3">
                        <input type="time" value={availability[day.key].start} onChange={(event) => setAvailability((current) => ({ ...current, [day.key]: { ...current[day.key], start: event.target.value } }))} className="input" disabled={!availability[day.key].enabled} />
                        <input type="time" value={availability[day.key].end} onChange={(event) => setAvailability((current) => ({ ...current, [day.key]: { ...current[day.key], end: event.target.value } }))} className="input" disabled={!availability[day.key].enabled} />
                      </div>
                    </div>
                  ))}
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-stone-700">Availability notes</label>
                  <textarea value={availabilitySummary} onChange={(event) => setAvailabilitySummary(event.target.value)} className="input min-h-28 resize-y" placeholder="Anything useful for employers to know, like preferred shift types or blackout dates." />
                </div>
              </div>
            </section>

            <section className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
              <div>
                <h2 className="text-lg font-semibold text-stone-900">Documents</h2>
                <p className="mt-2 text-sm leading-6 text-stone-600">
                  Optional uploads for compliance and trust. These are private to the worker account for now.
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {DOCUMENT_TYPES.map((documentType) => (
                  <div key={documentType} className="rounded-3xl border border-stone-200 bg-stone-50 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-stone-900">{DOCUMENT_LABELS[documentType]}</p>
                        <p className="mt-1 text-xs text-stone-500">Optional supporting document</p>
                      </div>
                      {existingDocuments[documentType] ? (
                        <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-900">Uploaded</span>
                      ) : (
                        <span className="rounded-full bg-stone-200 px-3 py-1 text-xs font-medium text-stone-700">Optional</span>
                      )}
                    </div>
                    <div className="mt-4">
                      <input type="file" onChange={(event) => handleDocumentChange(documentType, event)} className="input" />
                      <p className="mt-2 text-xs text-stone-500">
                        {documents[documentType]?.name || existingDocuments[documentType]?.file_name || "No file selected"}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {message ? (
              <p className="rounded-2xl bg-stone-100 px-4 py-3 text-sm text-stone-700">
                {message}
              </p>
            ) : null}

            <div className="flex flex-wrap gap-3">
              <button type="submit" className="primary-btn px-8" disabled={saving || loading}>
                {saving ? "Saving worker profile..." : mode === "onboarding" ? "Complete worker profile" : "Save changes"}
              </button>
              {mode === "manage" ? (
                <button type="button" onClick={() => router.push("/dashboard/worker")} className="rounded-2xl border border-stone-300 px-6 py-3 text-sm font-medium text-stone-700 transition hover:bg-stone-100">
                  Back to dashboard
                </button>
              ) : null}
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-3xl bg-stone-100 p-5">
                <p className="text-sm font-medium text-stone-500">Availability days</p>
                <p className="mt-2 text-2xl font-semibold text-stone-900">{selectedAvailabilityCount}</p>
              </div>
              <div className="rounded-3xl bg-stone-100 p-5">
                <p className="text-sm font-medium text-stone-500">Uploaded documents</p>
                <p className="mt-2 text-2xl font-semibold text-stone-900">{uploadedDocumentCount}</p>
              </div>
              <div className="rounded-3xl bg-stone-100 p-5">
                <p className="text-sm font-medium text-stone-500">Status options</p>
                <p className="mt-2 text-sm leading-6 text-stone-600">
                  {APPROVAL_STATUSES.map(approvalLabel).join(", ")}
                </p>
              </div>
            </div>
          </form>
        </div>
      </div>
  );
}
