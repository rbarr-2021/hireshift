"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type {
  RoleCategoryRecord,
  RoleRecord,
} from "@/lib/models";

type WorkerRolePickerProps = {
  categories: RoleCategoryRecord[];
  roles: RoleRecord[];
  primaryRoleId: string | null;
  additionalRoleIds: string[];
  onPrimaryRoleChange: (roleId: string) => void;
  onAdditionalRoleIdsChange: (roleIds: string[]) => void;
  disabled?: boolean;
};

type RoleComboboxProps = {
  label: string;
  helperText: string;
  placeholder: string;
  roles: RoleRecord[];
  selectedRole: RoleRecord | null;
  excludedRoleIds?: string[];
  emptyMessage: string;
  onSelect: (role: RoleRecord) => void;
  disabled?: boolean;
};

const OTHER_CATEGORY_VALUE = "other";

function matchesRoleSearch(role: RoleRecord, query: string) {
  const normalisedQuery = query.trim().toLowerCase();

  if (!normalisedQuery) {
    return true;
  }

  const searchableParts = [role.label, role.slug, ...(role.search_terms ?? [])]
    .join(" ")
    .toLowerCase();

  return searchableParts.includes(normalisedQuery);
}

function RoleCombobox({
  label,
  helperText,
  placeholder,
  roles,
  selectedRole,
  excludedRoleIds = [],
  emptyMessage,
  onSelect,
  disabled = false,
}: RoleComboboxProps) {
  const inputId = useId();
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const filteredRoles = useMemo(
    () =>
      roles.filter(
        (role) =>
          !excludedRoleIds.includes(role.id) && matchesRoleSearch(role, query),
      ),
    [excludedRoleIds, query, roles],
  );

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current) {
        return;
      }

      if (!rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  const clampedActiveIndex =
    filteredRoles.length === 0
      ? 0
      : Math.min(activeIndex, filteredRoles.length - 1);
  const activeRole = filteredRoles[clampedActiveIndex] ?? null;

  return (
    <div ref={rootRef} className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={inputId} className="block text-sm font-medium text-stone-700">
          {label}
        </label>
        {selectedRole ? (
          <span className="rounded-full bg-emerald-500 px-3 py-1 text-xs font-medium text-white">
            {selectedRole.label}
          </span>
        ) : null}
      </div>
      <p className="text-xs text-stone-500">{helperText}</p>
      <div className="relative">
        <input
          id={inputId}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (!open && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
              setOpen(true);
              return;
            }

            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActiveIndex((current) =>
                filteredRoles.length === 0
                  ? 0
                  : Math.min(current + 1, filteredRoles.length - 1),
              );
              return;
            }

            if (event.key === "ArrowUp") {
              event.preventDefault();
              setActiveIndex((current) =>
                filteredRoles.length === 0 ? 0 : Math.max(current - 1, 0),
              );
              return;
            }

            if (event.key === "Enter" && open && activeRole) {
              event.preventDefault();
              onSelect(activeRole);
              setQuery("");
              setOpen(false);
              return;
            }

            if (event.key === "Escape") {
              setOpen(false);
            }
          }}
          className="input"
          placeholder={selectedRole ? `Replace ${selectedRole.label}` : placeholder}
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-activedescendant={activeRole ? `${listboxId}-${activeRole.id}` : undefined}
          role="combobox"
          disabled={disabled}
        />
        {open ? (
          <div
            id={listboxId}
            role="listbox"
            className="absolute z-20 mt-2 max-h-72 w-full overflow-y-auto rounded-3xl border border-stone-200 bg-white p-2 shadow-[0_20px_60px_rgba(0,0,0,0.18)]"
          >
            {filteredRoles.length > 0 ? (
              <div className="space-y-1">
                {filteredRoles.map((role, index) => {
                  const selected = selectedRole?.id === role.id;
                  const active = index === clampedActiveIndex;

                  return (
                    <button
                      key={role.id}
                      id={`${listboxId}-${role.id}`}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => {
                        onSelect(role);
                        setQuery("");
                        setOpen(false);
                      }}
                      className={`flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left text-sm transition ${
                        active
                          ? "bg-stone-900 text-white"
                          : selected
                            ? "bg-emerald-50 text-emerald-900"
                            : "text-stone-700 hover:bg-stone-100"
                      }`}
                    >
                      <span>
                        <span className="block font-medium">{role.label}</span>
                        {role.category_label ? (
                          <span
                            className={`mt-1 block text-xs ${
                              active ? "text-stone-200" : "text-stone-500"
                            }`}
                          >
                            {role.category_label}
                          </span>
                        ) : null}
                      </span>
                      {selected ? (
                        <span className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600">
                          Selected
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-stone-200 px-4 py-6 text-center text-sm text-stone-500">
                {emptyMessage}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function WorkerRolePicker({
  categories,
  roles,
  primaryRoleId,
  additionalRoleIds,
  onPrimaryRoleChange,
  onAdditionalRoleIdsChange,
  disabled = false,
}: WorkerRolePickerProps) {
  const [selectedCategorySlug, setSelectedCategorySlug] = useState("");

  const rolesById = useMemo(
    () => new Map(roles.map((role) => [role.id, role])),
    [roles],
  );

  const primaryRole = primaryRoleId ? rolesById.get(primaryRoleId) ?? null : null;
  const additionalRoles = additionalRoleIds
    .map((roleId) => rolesById.get(roleId) ?? null)
    .filter((role): role is RoleRecord => Boolean(role));

  const activeCategorySlug =
    selectedCategorySlug || primaryRole?.category_slug || categories[0]?.slug || "";

  const rolesForSelectedCategory = useMemo(() => {
    if (!activeCategorySlug || activeCategorySlug === OTHER_CATEGORY_VALUE) {
      return roles;
    }

    return roles.filter((role) => role.category_slug === activeCategorySlug);
  }, [activeCategorySlug, roles]);

  const handlePrimarySelect = (role: RoleRecord) => {
    setSelectedCategorySlug(role.category_slug ?? activeCategorySlug);
    onPrimaryRoleChange(role.id);
    onAdditionalRoleIdsChange(
      additionalRoleIds.filter((roleId) => roleId !== role.id),
    );
  };

  const handleAdditionalSelect = (role: RoleRecord) => {
    if (additionalRoleIds.includes(role.id) || role.id === primaryRoleId) {
      return;
    }

    if (additionalRoleIds.length >= 3) {
      return;
    }

    onAdditionalRoleIdsChange([...additionalRoleIds, role.id]);
  };

  return (
    <div className="space-y-5 rounded-3xl border border-stone-200 bg-stone-50 p-4 sm:p-5">
      <div>
        <p className="text-sm font-semibold text-stone-900">
          What do you usually work as?
        </p>
      </div>

      <div className="space-y-3">
        <label htmlFor="worker-role-category" className="block text-sm font-medium text-stone-700">
          Choose a role category
        </label>
        <select
          id="worker-role-category"
          value={activeCategorySlug}
          onChange={(event) => setSelectedCategorySlug(event.target.value)}
          className="input"
          disabled={disabled}
        >
          {categories.map((category) => (
            <option key={category.id} value={category.slug}>
              {category.label}
            </option>
          ))}
          <option value={OTHER_CATEGORY_VALUE}>Other</option>
        </select>
      </div>

      <RoleCombobox
        label="Choose your main role"
        helperText=""
        placeholder="Start typing your role"
        roles={rolesForSelectedCategory}
        selectedRole={primaryRole}
        emptyMessage="No roles match that search in this category."
        onSelect={handlePrimarySelect}
        disabled={disabled}
      />

      <div className="space-y-3">
        <RoleCombobox
          label="Add any other roles you can cover"
          helperText=""
          placeholder="Search and add another role"
          roles={rolesForSelectedCategory}
          selectedRole={null}
          excludedRoleIds={[...(primaryRoleId ? [primaryRoleId] : []), ...additionalRoleIds]}
          emptyMessage="No more matching roles are available in this category."
          onSelect={handleAdditionalSelect}
          disabled={disabled || additionalRoleIds.length >= 3}
        />

        {additionalRoles.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {additionalRoles.map((role) => (
              <button
                key={role.id}
                type="button"
                onClick={() =>
                  onAdditionalRoleIdsChange(
                    additionalRoleIds.filter((roleId) => roleId !== role.id),
                  )
                }
                className="rounded-full bg-emerald-500 px-3 py-1 text-sm font-medium text-white transition hover:bg-emerald-600"
                disabled={disabled}
              >
                {role.label} ×
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
