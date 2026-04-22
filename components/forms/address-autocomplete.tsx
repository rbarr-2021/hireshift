"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { AddressSuggestion } from "@/lib/address-search";

type AddressAutocompleteProps = {
  label?: string;
  placeholder: string;
  helperText?: string;
  onSelect: (suggestion: AddressSuggestion) => void;
  selectionDisplay?: "label" | "addressLine1";
};

const MIN_ADDRESS_QUERY_LENGTH = 4;
const ADDRESS_SEARCH_DEBOUNCE_MS = 450;

export function AddressAutocomplete({
  label,
  placeholder,
  helperText,
  onSelect,
  selectionDisplay = "label",
}: AddressAutocompleteProps) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cacheRef = useRef(new Map<string, AddressSuggestion[]>());
  const skipNextSearchRef = useRef(false);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, []);

  useEffect(() => {
    const trimmedQuery = query.trim();

    if (skipNextSearchRef.current) {
      skipNextSearchRef.current = false;
      setLoading(false);
      return;
    }

    if (trimmedQuery.length < MIN_ADDRESS_QUERY_LENGTH) {
      setSuggestions([]);
      setError(null);
      setLoading(false);
      return;
    }

    const cacheKey = trimmedQuery.toLowerCase();
    const cachedSuggestions = cacheRef.current.get(cacheKey);

    if (cachedSuggestions) {
      setSuggestions(cachedSuggestions);
      setError(null);
      setLoading(false);
      setIsOpen(true);
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/address-search?q=${encodeURIComponent(trimmedQuery)}`, {
          signal: controller.signal,
        });
        const payload = (await response.json()) as {
          suggestions?: AddressSuggestion[];
          error?: string;
        };

        if (!response.ok) {
          throw new Error(payload.error || "Address search is unavailable right now.");
        }

        const nextSuggestions = payload.suggestions ?? [];
        cacheRef.current.set(cacheKey, nextSuggestions);
        setSuggestions(nextSuggestions);
        setIsOpen(true);
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        setSuggestions([]);
        setError(
          error instanceof Error
            ? error.message
            : "Address search is unavailable right now.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }, ADDRESS_SEARCH_DEBOUNCE_MS);

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [query]);

  const hasQuery = useMemo(
    () => query.trim().length >= MIN_ADDRESS_QUERY_LENGTH,
    [query],
  );

  return (
    <div className="space-y-2">
      {label ? <label className="block text-sm font-medium text-stone-700">{label}</label> : null}
      <div ref={containerRef} className="relative">
        <input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setIsOpen(true);
          }}
          onFocus={() => {
            if (suggestions.length > 0 || error) {
              setIsOpen(true);
            }
          }}
          className="input"
          placeholder={placeholder}
        />
        {isOpen && (loading || suggestions.length > 0 || error || hasQuery) ? (
          <div className="panel-soft absolute left-0 right-0 top-[calc(100%+0.5rem)] z-30 max-h-80 overflow-y-auto rounded-2xl border px-2 py-2 shadow-2xl">
            {loading ? (
              <p className="px-3 py-3 text-sm text-stone-500">Searching addresses...</p>
            ) : error ? (
              <p className="px-3 py-3 text-sm text-red-300">{error}</p>
            ) : suggestions.length > 0 ? (
              <div className="space-y-1">
                {suggestions.map((suggestion) => (
                  <button
                    key={suggestion.id}
                    type="button"
                    onClick={() => {
                      onSelect(suggestion);
                      skipNextSearchRef.current = true;
                      setQuery(
                        selectionDisplay === "addressLine1"
                          ? suggestion.addressLine1 || suggestion.label
                          : suggestion.label,
                      );
                      setSuggestions([]);
                      setError(null);
                      setIsOpen(false);
                    }}
                    className="w-full rounded-xl px-3 py-3 text-left text-sm text-stone-100 transition hover:bg-white/6"
                  >
                    <p className="font-medium text-stone-100">{suggestion.label}</p>
                    <p className="mt-1 text-xs text-stone-500">
                      {[
                        suggestion.addressLine1 || null,
                        suggestion.city || null,
                        suggestion.postcode || null,
                      ]
                        .filter(Boolean)
                        .join(" | ")}
                    </p>
                  </button>
                ))}
              </div>
            ) : hasQuery ? (
              <p className="px-3 py-3 text-sm text-stone-500">
                No matching addresses found yet. Try a fuller postcode or street name.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
      <p className="text-xs text-stone-500">
        {helperText
          ? `${helperText} Search starts after ${MIN_ADDRESS_QUERY_LENGTH} characters to keep lookups efficient.`
          : `Search starts after ${MIN_ADDRESS_QUERY_LENGTH} characters to keep lookups efficient.`}
      </p>
    </div>
  );
}
