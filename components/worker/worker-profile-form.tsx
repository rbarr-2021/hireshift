"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useAuthState } from "@/components/auth/auth-provider";
import { AvailabilityCalendar } from "@/components/worker/availability-calendar";
import { WorkerRolePicker } from "@/components/worker/role-picker";
import { sanitiseAppRedirectPath } from "@/lib/auth-client";
import { getAddressFromCurrentLocation } from "@/lib/geolocation";
import { clearPostAuthIntent, readPostAuthIntent } from "@/lib/post-auth-intent";
import { normaliseInternationalPhoneNumber } from "@/lib/phone";
import { supabase } from "@/lib/supabase";
import { OnboardingProgress } from "@/components/onboarding/onboarding-progress";
import { useToast } from "@/components/ui/toast-provider";
import {
  APPROVAL_STATUSES,
  DOCUMENT_LABELS,
  DOCUMENT_TYPES,
  type ApprovalStatus,
  type DocumentType,
  type RoleCategoryRecord,
  type RoleRecord,
  type UserRecord,
  type WorkHistoryItem,
  type WorkerAvailabilityRecord,
  type WorkerAvailabilitySlotRecord,
  type WorkerDocumentRecord,
  type WorkerProfileRecord,
  type WorkerRoleRecord,
} from "@/lib/models";

type WorkerProfileFormProps = {
  mode: "onboarding" | "manage";
};

type DocumentFileState = Partial<Record<DocumentType, File | null>>;
type WorkerSaveStage =
  | "auth"
  | "users"
  | "worker_profiles"
  | "worker-profile-assets"
  | "worker_availability"
  | "worker_availability_slots"
  | "worker_roles"
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

const DEFAULT_FALLBACK_DAYS = 62;

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

function getDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getDatePart(value: string | null) {
  return value ? value.slice(0, 10) : null;
}

function getTimePart(value: string | null) {
  return value ? value.slice(11, 16) : null;
}

function createFallbackAvailabilityFromWeeklySlots(
  workerId: string,
  slots: WorkerAvailabilitySlotRecord[],
) {
  const entries: WorkerAvailabilityRecord[] = [];
  const today = new Date();

  for (let offset = 0; offset < DEFAULT_FALLBACK_DAYS; offset += 1) {
    const currentDate = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate() + offset,
    );
    const matchingSlots = slots.filter(
      (slot) => slot.day_of_week === currentDate.getDay(),
    );

    if (matchingSlots.length === 0) {
      continue;
    }

    const startTimes = matchingSlots.map((slot) => slot.start_time.slice(0, 5)).sort();
    const endTimes = matchingSlots.map((slot) => slot.end_time.slice(0, 5)).sort();
    const startTime = startTimes[0];
    const endTime = endTimes[endTimes.length - 1];
    const status =
      startTime === "00:00" && endTime === "23:59" ? "available" : "partial";

    entries.push({
      id: `fallback-${getDateKey(currentDate)}`,
      worker_id: workerId,
      availability_date: getDateKey(currentDate),
      status,
      start_datetime: `${getDateKey(currentDate)}T${startTime}:00`,
      end_datetime: `${getDateKey(currentDate)}T${endTime}:00`,
      created_at: "",
      updated_at: "",
    });
  }

  return entries;
}

function buildWeeklyCompatibilitySlots(
  workerId: string,
  entries: WorkerAvailabilityRecord[],
) {
  const grouped = entries
    .filter(
      (entry) =>
        entry.status !== "unavailable" &&
        entry.start_datetime &&
        entry.end_datetime,
    )
    .reduce<Record<number, { start: string; end: string }>>((accumulator, entry) => {
      const startDate = new Date(entry.start_datetime!);
      const endDate = new Date(entry.end_datetime!);
      const startWeekday = startDate.getDay();
      const startTime = getTimePart(entry.start_datetime!) ?? "00:00";
      const endTime = getTimePart(entry.end_datetime!) ?? "23:59";
      const endDateKey = getDatePart(entry.end_datetime!);

      const mergeSlot = (weekday: number, nextStart: string, nextEnd: string) => {
        if (nextEnd <= nextStart) {
          return;
        }

        const current = accumulator[weekday];

        if (!current) {
          accumulator[weekday] = { start: nextStart, end: nextEnd };
          return;
        }

        accumulator[weekday] = {
          start: nextStart < current.start ? nextStart : current.start,
          end: nextEnd > current.end ? nextEnd : current.end,
        };
      };

      if (endDateKey && endDateKey !== entry.availability_date) {
        mergeSlot(startWeekday, startTime, "23:59");
        mergeSlot(endDate.getDay(), "00:00", endTime);
        return accumulator;
      }

      mergeSlot(startWeekday, startTime, endTime);

      return accumulator;
    }, {});

  return Object.entries(grouped).map(([dayOfWeek, times]) => ({
    worker_id: workerId,
    day_of_week: Number(dayOfWeek),
    start_time: times.start,
    end_time: times.end,
  }));
}

function normaliseRoleCatalog(
  categories: RoleCategoryRecord[],
  roles: RoleRecord[],
) {
  const categoriesById = new Map(categories.map((category) => [category.id, category]));

  return roles
    .map((role) => {
      const category = categoriesById.get(role.category_id);

      return {
        ...role,
        category_slug: category?.slug,
        category_label: category?.label,
      };
    })
    .sort((left, right) => {
      if ((left.category_label ?? "") === (right.category_label ?? "")) {
        return left.sort_order - right.sort_order;
      }

      const leftCategoryOrder =
        categoriesById.get(left.category_id)?.sort_order ?? Number.MAX_SAFE_INTEGER;
      const rightCategoryOrder =
        categoriesById.get(right.category_id)?.sort_order ?? Number.MAX_SAFE_INTEGER;

      if (leftCategoryOrder === rightCategoryOrder) {
        return left.label.localeCompare(right.label);
      }

      return leftCategoryOrder - rightCategoryOrder;
    });
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
  const { refreshAuthState } = useAuthState();
  const { showToast } = useToast();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [whatsAppOptIn, setWhatsAppOptIn] = useState(false);
  const [jobRole, setJobRole] = useState("");
  const [roleCategories, setRoleCategories] = useState<RoleCategoryRecord[]>([]);
  const [roleCatalog, setRoleCatalog] = useState<RoleRecord[]>([]);
  const [primaryRoleId, setPrimaryRoleId] = useState<string | null>(null);
  const [additionalRoleIds, setAdditionalRoleIds] = useState<string[]>([]);
  const [bio, setBio] = useState("");
  const [hourlyRate, setHourlyRate] = useState<string>("");
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
  const [availabilityEntries, setAvailabilityEntries] = useState<WorkerAvailabilityRecord[]>([]);
  const [documents, setDocuments] = useState<DocumentFileState>({});
  const [existingDocuments, setExistingDocuments] = useState<
    Partial<Record<DocumentType, WorkerDocumentRecord>>
  >({});
  const [approvalStatus, setApprovalStatus] = useState<ApprovalStatus>("pending");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
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

      const [
        appUserResult,
        profileResult,
        roleCategoriesResult,
        rolesResult,
        workerRolesResult,
        dateAvailabilityResult,
        weeklyAvailabilityResult,
        documentsResult,
      ] =
        await Promise.all([
          supabase.from("users").select("*").eq("id", user.id).maybeSingle<UserRecord>(),
          supabase
            .from("worker_profiles")
            .select("*")
            .eq("user_id", user.id)
            .maybeSingle<WorkerProfileRecord>(),
          supabase
            .from("role_categories")
            .select("*")
            .eq("is_active", true)
            .order("sort_order", { ascending: true }),
          supabase
            .from("roles")
            .select("*")
            .eq("is_active", true)
            .order("sort_order", { ascending: true }),
          supabase
            .from("worker_roles")
            .select("*")
            .eq("worker_id", user.id),
          supabase
            .from("worker_availability")
            .select("*")
            .eq("worker_id", user.id)
            .order("availability_date", { ascending: true }),
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
      const categories =
        (roleCategoriesResult.data as RoleCategoryRecord[] | null) ?? [];
      const roles = normaliseRoleCatalog(
        categories,
        (rolesResult.data as RoleRecord[] | null) ?? [],
      );
      const workerRoles =
        (workerRolesResult.data as WorkerRoleRecord[] | null) ?? [];
      const dateAvailability =
        (dateAvailabilityResult.data as WorkerAvailabilityRecord[] | null) ?? [];
      const availabilitySlots =
        (weeklyAvailabilityResult.data as WorkerAvailabilitySlotRecord[] | null) ?? [];
      const workerDocuments =
        (documentsResult.data as WorkerDocumentRecord[] | null) ?? [];

      if (roleCategoriesResult.error || rolesResult.error || workerRolesResult.error) {
        setMessage(
          roleCategoriesResult.error?.message ??
            rolesResult.error?.message ??
            workerRolesResult.error?.message ??
            "We could not load the role catalog right now.",
        );
      }

      setRoleCategories(categories);
      setRoleCatalog(roles);

      if (appUser?.display_name) {
        setFullName(appUser.display_name);
      }
      if (appUser?.phone) {
        setPhone(normaliseInternationalPhoneNumber(appUser.phone) ?? appUser.phone);
      }
      if (typeof appUser?.whatsapp_opt_in === "boolean") {
        setWhatsAppOptIn(appUser.whatsapp_opt_in);
      }

      if (profile) {
        const primaryWorkerRole =
          workerRoles.find((workerRole) => workerRole.is_primary) ?? workerRoles[0] ?? null;
        const matchedPrimaryRole =
          (primaryWorkerRole
            ? roles.find((role) => role.id === primaryWorkerRole.role_id)
            : null) ??
          (profile.primary_role_id
            ? roles.find((role) => role.id === profile.primary_role_id)
            : null) ??
          roles.find(
            (role) => role.label.toLowerCase() === profile.job_role.toLowerCase(),
          ) ??
          null;

        setPrimaryRoleId(matchedPrimaryRole?.id ?? null);
        setAdditionalRoleIds(
          workerRoles
            .filter((workerRole) => !workerRole.is_primary)
            .map((workerRole) => workerRole.role_id)
            .slice(0, 3),
        );
        setJobRole(matchedPrimaryRole?.label ?? profile.job_role ?? "");
        setBio(profile.bio ?? "");
        setHourlyRate(
          profile.hourly_rate_gbp !== null ? String(profile.hourly_rate_gbp) : "",
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
      } else {
        setPrimaryRoleId(null);
        setAdditionalRoleIds([]);
        setJobRole("");
      }

      setAvailabilityEntries(
        dateAvailability.length > 0
          ? dateAvailability
          : createFallbackAvailabilityFromWeeklySlots(user.id, availabilitySlots),
      );
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
    () =>
      availabilityEntries.filter((entry) => entry.status !== "unavailable").length,
    [availabilityEntries],
  );

  const uploadedDocumentCount = useMemo(
    () =>
      DOCUMENT_TYPES.filter(
        (documentType) => existingDocuments[documentType] || documents[documentType],
      ).length,
    [documents, existingDocuments],
  );

  const rolesById = useMemo(
    () => new Map(roleCatalog.map((role) => [role.id, role])),
    [roleCatalog],
  );

  const primaryRole = primaryRoleId ? rolesById.get(primaryRoleId) ?? null : null;
  const additionalRoles = additionalRoleIds
    .map((roleId) => rolesById.get(roleId) ?? null)
    .filter((role): role is RoleRecord => Boolean(role));

  const completion = useMemo(() => {
    const completedChecks = [
      fullName.trim().length > 0,
      phone.trim().length > 0,
      bio.trim().length >= 24,
      Boolean(primaryRoleId),
      yearsExperience.trim().length > 0,
      city.trim().length > 0,
      travelRadius.trim().length > 0,
      selectedAvailabilityCount > 0,
    ];

    const score = completedChecks.filter(Boolean).length;
    return Math.round((score / completedChecks.length) * 100);
  }, [
    bio,
    city,
    fullName,
    phone,
    primaryRoleId,
    selectedAvailabilityCount,
    travelRadius,
    yearsExperience,
  ]);

  const handlePrimaryRoleChange = (roleId: string) => {
    const nextRole = rolesById.get(roleId);

    setPrimaryRoleId(roleId);
    setAdditionalRoleIds((current) => current.filter((item) => item !== roleId));

    if (nextRole) {
      setJobRole(nextRole.label);
    }
  };

  const handleAdditionalRolesChange = (roleIds: string[]) => {
    setAdditionalRoleIds(roleIds.slice(0, 3));
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
    if (!phone.trim()) return "Phone number is required.";
    if (!normaliseInternationalPhoneNumber(phone)) {
      return "Enter your mobile number in international format, for example +447700900123.";
    }
    if (bio.trim().length < 24) return "Add a short work summary so businesses know your background.";
    if (!primaryRoleId) return "Choose your main role.";
    if (additionalRoleIds.length > 3) return "You can add up to three additional roles.";
    if (!yearsExperience.trim()) return "Years of experience is required.";
    if (!city.trim()) return "Base location is required.";
    if (!travelRadius.trim()) return "Travel radius is required.";
    if (selectedAvailabilityCount === 0) {
      return "Add at least one available date to complete your profile.";
    }

    const invalidAvailability = availabilityEntries.some((entry) => {
      if (entry.status === "unavailable") {
        return false;
      }

      if (!entry.start_datetime || !entry.end_datetime) {
        return true;
      }

      return entry.end_datetime <= entry.start_datetime;
    });

    if (invalidAvailability) {
      return "Each available date must have a valid time range, and overnight shifts must end after they start.";
    }

    if (!primaryRole) {
      return "Your selected primary role could not be matched. Refresh and try again.";
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

  const handleUseLocation = async () => {
    if (locating) {
      return;
    }

    setLocating(true);
    setMessage(null);

    try {
      const address = await getAddressFromCurrentLocation();

      setCity((current) => current || address.city);

      showToast({
        title: "Area added",
        description: "We used your location to help fill your city. Please check your postcode manually.",
        tone: "success",
      });
    } catch (error) {
      const nextMessage =
        error instanceof Error
          ? error.message
          : "We could not use your location right now.";
      setMessage(nextMessage);
      showToast({
        title: "Location unavailable",
        description: nextMessage,
        tone: "error",
      });
    } finally {
      setLocating(false);
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
        .select("id, role, phone, onboarding_complete")
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

      const availabilityPayload = availabilityEntries
        .map((entry) => ({
          worker_id: user.id,
          availability_date: entry.availability_date,
          status: entry.status,
          start_datetime:
            entry.status === "unavailable" ? null : entry.start_datetime,
          end_datetime:
            entry.status === "unavailable" ? null : entry.end_datetime,
        }))
        .sort((left, right) =>
          left.availability_date.localeCompare(right.availability_date),
        );

      const availabilitySlotPayload = buildWeeklyCompatibilitySlots(
        user.id,
        availabilityEntries,
      );

      const rolePayload = [
        primaryRoleId
          ? {
              worker_id: user.id,
              role_id: primaryRoleId,
              is_primary: true,
            }
          : null,
        ...additionalRoleIds.map((roleId) => ({
          worker_id: user.id,
          role_id: roleId,
          is_primary: false,
        })),
      ].filter(
        (
          entry,
        ): entry is { worker_id: string; role_id: string; is_primary: boolean } =>
          Boolean(entry),
      );

      const workerProfilePayload = {
        user_id: user.id,
        job_role: primaryRole?.label ?? jobRole,
        primary_role_id: primaryRoleId,
        bio: bio.trim(),
        hourly_rate_gbp: hourlyRate ? Number(hourlyRate) : null,
        years_experience: Number(yearsExperience),
        city: city.trim(),
        postcode: postcode.trim() || null,
        travel_radius_miles: Number(travelRadius),
        availability_summary: availabilitySummary.trim() || null,
        profile_photo_url: nextPhotoUrl,
        profile_photo_path: nextPhotoPath,
        work_history: historyPayload,
      };
      const normalisedPhone = normaliseInternationalPhoneNumber(phone);

      console.info("[worker-profile-save] payload", {
        authUserId: user.id,
        appUserId: appUser.id,
        userUpdate: {
          id: user.id,
          role: "worker",
          phone: normalisedPhone,
          whatsapp_opt_in: whatsAppOptIn,
          onboarding_complete: true,
        },
        workerProfilePayload,
        rolePayload,
        availabilityPayload,
        availabilitySlotPayload,
        documentTypes: DOCUMENT_TYPES.filter((documentType) => documents[documentType]),
      });

      const { data: existingWorkerProfile, error: existingWorkerProfileError } =
        await supabase
          .from("worker_profiles")
          .select("user_id")
          .eq("user_id", user.id)
          .maybeSingle();

      if (existingWorkerProfileError) {
        throw createWorkerSaveError("worker_profiles", existingWorkerProfileError);
      }

      const [{ error: userError }, { error: profileError }] = await Promise.all([
        supabase
          .from("users")
          .update({
            display_name: fullName.trim(),
            phone: normalisedPhone,
            whatsapp_opt_in: whatsAppOptIn,
            role: "worker",
            role_selected: true,
            onboarding_complete: true,
          })
          .eq("id", user.id),
        existingWorkerProfile
          ? supabase
              .from("worker_profiles")
              .update(workerProfilePayload)
              .eq("user_id", user.id)
          : supabase.from("worker_profiles").insert(workerProfilePayload),
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

      const { error: deleteWorkerRolesError } = await supabase
        .from("worker_roles")
        .delete()
        .eq("worker_id", user.id);

      if (deleteWorkerRolesError) {
        throw createWorkerSaveError("worker_roles", deleteWorkerRolesError);
      }

      if (rolePayload.length > 0) {
        const { error: insertWorkerRolesError } = await supabase
          .from("worker_roles")
          .insert(rolePayload);

        if (insertWorkerRolesError) {
          throw createWorkerSaveError("worker_roles", insertWorkerRolesError);
        }
      }

      const { error: deleteDateAvailabilityError } = await supabase
        .from("worker_availability")
        .delete()
        .eq("worker_id", user.id);

      if (deleteDateAvailabilityError) {
        throw createWorkerSaveError(
          "worker_availability",
          deleteDateAvailabilityError,
        );
      }

      if (availabilityPayload.length > 0) {
        const { error: insertDateAvailabilityError } = await supabase
          .from("worker_availability")
          .insert(availabilityPayload);

        if (insertDateAvailabilityError) {
          throw createWorkerSaveError(
            "worker_availability",
            insertDateAvailabilityError,
          );
        }
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

      if (availabilitySlotPayload.length > 0) {
        const { error: insertAvailabilityError } = await supabase
          .from("worker_availability_slots")
          .insert(availabilitySlotPayload);

        if (insertAvailabilityError) {
          throw createWorkerSaveError(
            "worker_availability_slots",
            insertAvailabilityError,
          );
        }
      }

      await saveDocuments(user.id);

      await refreshAuthState();

      showToast({
        title: mode === "onboarding" ? "Worker profile ready" : "Worker profile saved",
        description:
          mode === "onboarding"
            ? "Your profile is ready for discovery and future bookings."
            : "Your profile details have been updated successfully.",
        tone: "success",
      });

      setMessage(
        mode === "onboarding"
          ? "Worker profile completed."
          : "Worker profile saved successfully.",
      );

      if (mode === "onboarding") {
        const redirectTarget =
          typeof window !== "undefined"
            ? sanitiseAppRedirectPath(
                new URLSearchParams(window.location.search).get("redirect"),
              ) ?? readPostAuthIntent()
            : null;

        console.info("[auth] redirect decision", {
          reason: "worker-onboarding-complete",
          pathname: "/profile/setup/worker",
          hasSession: true,
          authUserId: user.id,
          role: "worker",
          target: redirectTarget ?? "/dashboard/worker",
        });
        clearPostAuthIntent();
        router.push(redirectTarget ?? "/dashboard/worker");
      } else {
        router.refresh();
      }
    } catch (error) {
      const nextMessage =
        error instanceof Error ? error.message : "Unable to save your worker profile.";
      setMessage(nextMessage);
      showToast({
        title: "Worker profile error",
        description: nextMessage,
        tone: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
      <div className="min-h-screen bg-black px-3 py-8 pb-28 sm:px-4 sm:py-10">
        <div className="panel mx-auto max-w-6xl p-4 sm:p-6 lg:p-8">
          {mode === "onboarding" ? (
            <OnboardingProgress role="worker" step="profile" />
          ) : null}
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="section-label">
                {mode === "onboarding" ? "Worker onboarding" : "Worker profile"}
              </p>
              <h1 className="mt-4 text-2xl font-semibold text-stone-900 sm:text-3xl">
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
                  <div className="h-24 w-24 overflow-hidden rounded-3xl bg-stone-100 sm:h-28 sm:w-28">
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
                    Phone number
                  </label>
                  <input
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
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
                    required
                  />
                  <p className="mt-2 text-xs text-stone-500">
                    Use international format so shift confirmations can reach you on WhatsApp if you opt in later.
                  </p>
                </div>

                <div className="md:col-span-2">
                  <label className="panel-soft flex cursor-pointer items-start gap-3 rounded-2xl px-4 py-4">
                    <input
                      type="checkbox"
                      checked={whatsAppOptIn}
                      onChange={(event) => setWhatsAppOptIn(event.target.checked)}
                      className="mt-1 h-4 w-4 rounded border-stone-300 text-stone-900 focus:ring-stone-400"
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-stone-900">
                        Get shift confirmations and reminders on WhatsApp
                      </span>
                      <span className="mt-1 block text-xs leading-5 text-stone-600">
                        Optional. We will only use your number for booking confirmations and 24-hour reminders.
                      </span>
                    </span>
                  </label>
                </div>

                <div className="md:col-span-2">
                  <WorkerRolePicker
                    categories={roleCategories}
                    roles={roleCatalog}
                    primaryRoleId={primaryRoleId}
                    additionalRoleIds={additionalRoleIds}
                    onPrimaryRoleChange={handlePrimaryRoleChange}
                    onAdditionalRoleIdsChange={handleAdditionalRolesChange}
                    disabled={saving || loading}
                  />
                  {primaryRole ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className="rounded-full bg-stone-900 px-3 py-1 text-sm font-medium text-white">
                        Main role: {primaryRole.label}
                      </span>
                      {additionalRoles.map((role) => (
                        <span
                          key={role.id}
                          className="rounded-full bg-stone-100 px-3 py-1 text-sm font-medium text-stone-700"
                        >
                          Also covers: {role.label}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div className="md:col-span-2">
                  <label className="mb-2 block text-sm font-medium text-stone-700">
                    Bio / about
                  </label>
                  <textarea
                    value={bio}
                    onChange={(event) => setBio(event.target.value)}
                    className="input min-h-36 resize-y"
                    placeholder="Share a short summary of your hospitality background and the kinds of shifts you usually cover."
                    required
                  />
                  <p className="mt-2 text-xs text-stone-500">
                    A short summary is enough for your first shift.
                  </p>
                </div>
              </div>
            </section>

            <section className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
              <div>
                <h2 className="text-lg font-semibold text-stone-900">Rates</h2>
                <p className="mt-2 text-sm leading-6 text-stone-600">
                  Set a clear hourly rate so businesses know what to expect before they book you.
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
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
                    required
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
                  <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <label className="block text-sm font-medium text-stone-700">City</label>
                    <button
                      type="button"
                      onClick={() => void handleUseLocation()}
                      disabled={locating}
                      className="secondary-btn w-full px-4 py-2 text-sm sm:w-auto"
                    >
                      {locating ? "Finding area..." : "Use my location"}
                    </button>
                  </div>
                  <input value={city} onChange={(event) => setCity(event.target.value)} className="input" placeholder="Manchester" required />
                  <p className="mt-2 text-xs text-stone-500">
                    Optional: use your device location to fill your area, then check your postcode manually.
                  </p>
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
                  Mark exact dates on the calendar so businesses can see when you are
                  free without guessing from a recurring weekly pattern.
                </p>
              </div>
              <div className="space-y-4">
                <AvailabilityCalendar
                  entries={availabilityEntries}
                  onChange={setAvailabilityEntries}
                />
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
              <p className="info-banner">
                {message}
              </p>
            ) : null}

            <div className="hidden gap-3 sm:flex sm:flex-row sm:flex-wrap">
              <button type="submit" className="primary-btn w-full px-8 sm:w-auto" disabled={saving || loading}>
                {saving ? "Saving worker profile..." : mode === "onboarding" ? "Complete worker profile" : "Save changes"}
              </button>
              {mode === "manage" ? (
                <button type="button" onClick={() => router.push("/dashboard/worker")} className="secondary-btn w-full px-6 sm:w-auto">
                  Back to dashboard
                </button>
              ) : null}
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="panel-soft p-5">
                <p className="text-sm font-medium text-stone-500">Available dates</p>
                <p className="mt-2 text-2xl font-semibold text-stone-900">{selectedAvailabilityCount}</p>
              </div>
              <div className="panel-soft p-5">
                <p className="text-sm font-medium text-stone-500">Uploaded documents</p>
                <p className="mt-2 text-2xl font-semibold text-stone-900">{uploadedDocumentCount}</p>
              </div>
              <div className="panel-soft p-5">
                <p className="text-sm font-medium text-stone-500">Status options</p>
                <p className="mt-2 text-sm leading-6 text-stone-600">
                  {APPROVAL_STATUSES.map(approvalLabel).join(", ")}
                </p>
              </div>
            </div>
          </form>
        </div>
        <div className={`mobile-sticky-bar ${mode === "manage" ? "bottom-24" : "bottom-3"} sm:hidden`}>
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={() => {
                const form = document.querySelector("form");
                form?.requestSubmit();
              }}
              className="primary-btn w-full"
              disabled={saving || loading}
            >
              {saving ? "Saving worker profile..." : mode === "onboarding" ? "Complete worker profile" : "Save changes"}
            </button>
            {mode === "manage" ? (
              <button type="button" onClick={() => router.push("/dashboard/worker")} className="secondary-btn w-full">
                Back to dashboard
              </button>
            ) : null}
          </div>
        </div>
      </div>
  );
}
