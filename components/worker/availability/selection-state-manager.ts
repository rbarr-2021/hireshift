"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type SelectionStateManagerOptions = {
  multiSelectEnabled: boolean;
};

type DragAction = "add" | "remove";

export function useSelectionStateManager({
  multiSelectEnabled,
}: SelectionStateManagerOptions) {
  const [selectedDateKeys, setSelectedDateKeys] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [dragAction, setDragAction] = useState<DragAction>("add");
  const [dragSeenKeys, setDragSeenKeys] = useState<string[]>([]);
  const [suppressClickKey, setSuppressClickKey] = useState<string | null>(null);

  const selectedSet = useMemo(
    () => new Set(selectedDateKeys),
    [selectedDateKeys],
  );

  const clearSelection = useCallback(() => {
    setSelectedDateKeys([]);
  }, []);

  const applyDragAction = useCallback((dateKey: string, action: DragAction) => {
    setSelectedDateKeys((current) => {
      const hasDate = current.includes(dateKey);

      if (action === "add") {
        if (hasDate) {
          return current;
        }

        return [...current, dateKey].sort();
      }

      if (!hasDate) {
        return current;
      }

      return current.filter((key) => key !== dateKey);
    });
  }, []);

  const handleDayClick = useCallback(
    (dateKey: string) => {
      if (suppressClickKey === dateKey) {
        setSuppressClickKey(null);
        return;
      }

      if (!multiSelectEnabled) {
        setSelectedDateKeys([dateKey]);
        return;
      }

      setSelectedDateKeys((current) => {
        if (current.includes(dateKey)) {
          return current.filter((key) => key !== dateKey);
        }

        return [...current, dateKey].sort();
      });
    },
    [multiSelectEnabled, suppressClickKey],
  );

  const startDragSelection = useCallback(
    (dateKey: string) => {
      if (!multiSelectEnabled) {
        return;
      }

      const action: DragAction = selectedSet.has(dateKey) ? "remove" : "add";
      setDragAction(action);
      setIsDragging(true);
      setDragSeenKeys([dateKey]);
      setSuppressClickKey(dateKey);
      applyDragAction(dateKey, action);
    },
    [applyDragAction, multiSelectEnabled, selectedSet],
  );

  const continueDragSelection = useCallback(
    (dateKey: string) => {
      if (!multiSelectEnabled || !isDragging) {
        return;
      }

      if (dragSeenKeys.includes(dateKey)) {
        return;
      }

      setDragSeenKeys((current) => [...current, dateKey]);
      applyDragAction(dateKey, dragAction);
    },
    [applyDragAction, dragAction, dragSeenKeys, isDragging, multiSelectEnabled],
  );

  const stopDragSelection = useCallback(() => {
    if (!isDragging) {
      return;
    }

    setIsDragging(false);
    setDragSeenKeys([]);
  }, [isDragging]);

  useEffect(() => {
    if (!multiSelectEnabled) {
      setIsDragging(false);
      setDragSeenKeys([]);
    }
  }, [multiSelectEnabled]);

  useEffect(() => {
    const handlePointerUp = () => {
      stopDragSelection();
    };

    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);

    return () => {
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [stopDragSelection]);

  return {
    selectedDateKeys,
    selectedSet,
    isDragging,
    handleDayClick,
    startDragSelection,
    continueDragSelection,
    stopDragSelection,
    clearSelection,
    setSelectedDateKeys,
  };
}

