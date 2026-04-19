import type {
  RoleRecord,
  WorkerAvailabilitySlotRecord,
  WorkerRoleRecord,
} from "@/lib/models";

export type WorkerMarketplaceTag = {
  id: string;
  label: string;
  slug: string;
  isPrimary: boolean;
  categoryLabel: string | null;
};

export type WorkerAvailabilityState = "has_availability" | "needs_update";

export function getWorkerExperienceLabel(yearsExperience: number) {
  if (yearsExperience >= 8) {
    return "Senior";
  }

  if (yearsExperience >= 5) {
    return "Highly experienced";
  }

  if (yearsExperience >= 2) {
    return "Experienced";
  }

  return "Building experience";
}

export function getWorkerAvailabilityState(input: {
  availabilitySlots: WorkerAvailabilitySlotRecord[];
  availabilitySummary?: string | null;
}): WorkerAvailabilityState {
  const hasStructuredAvailability = input.availabilitySlots.length > 0;
  const hasSummary = Boolean(input.availabilitySummary?.trim());

  return hasStructuredAvailability || hasSummary ? "has_availability" : "needs_update";
}

export function buildWorkerMarketplaceTags(input: {
  workerId: string;
  workerRoles: WorkerRoleRecord[];
  roles: RoleRecord[];
}) {
  const roleSelections = input.workerRoles
    .filter((roleSelection) => roleSelection.worker_id === input.workerId)
    .sort((left, right) => Number(right.is_primary) - Number(left.is_primary));

  const tags = roleSelections
    .map<WorkerMarketplaceTag | null>((selection) => {
      const matchingRole = input.roles.find((role) => role.id === selection.role_id);

      if (!matchingRole) {
        return null;
      }

      return {
        id: selection.id,
        label: matchingRole.label,
        slug: matchingRole.slug,
        isPrimary: selection.is_primary,
        categoryLabel: matchingRole.category_label ?? null,
      };
    })
    .filter((tag): tag is WorkerMarketplaceTag => tag !== null);

  return tags;
}
