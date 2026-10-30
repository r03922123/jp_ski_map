"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  addList,
  findPlace,
  type ListIcon,
  type PlaceInput,
  savedStore,
  setHotel,
  toggleInList,
  useSaved,
} from "@/lib/saved-places";

export const LIST_ICONS: Record<ListIcon, string> = {
  star: "⭐",
  heart: "❤️",
  flag: "🚩",
  bookmark: "🔖",
};

/** Bottom-sheet style dialog: tick the lists a place belongs to, like Google's Save sheet. */
export function ListPicker({
  place,
  onClose,
}: {
  place: PlaceInput;
  onClose: () => void;
}) {
  const state = useSaved();
  const current = findPlace(state, place.id);
  const [newName, setNewName] = useState("");
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  function createList() {
    savedStore.update((s) => {
      const created = addList(s, newName, "bookmark");
      return created ? toggleInList(created.state, place, created.id) : s;
    });
    setNewName("");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 md:items-center">
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        className="absolute inset-0 cursor-default"
        onClick={onClose}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative flex max-h-[80dvh] w-full max-w-sm flex-col gap-3 overflow-y-auto rounded-t-2xl bg-background p-4 shadow-xl outline-none md:rounded-2xl"
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
      >
        <div>
          <h2 id={titleId} className="font-semibold">
            Save to list
          </h2>
          <p className="truncate text-sm text-muted-foreground">{place.name}</p>
        </div>

        <ul className="flex flex-col">
          {state.lists.map((list) => (
            <li key={list.id}>
              <label className="flex cursor-pointer items-center gap-3 rounded-md px-1 py-2 hover:bg-muted">
                <input
                  type="checkbox"
                  className="size-4"
                  checked={current?.lists.includes(list.id) ?? false}
                  onChange={() =>
                    savedStore.update((s) => toggleInList(s, place, list.id))
                  }
                />
                <span aria-hidden="true">{LIST_ICONS[list.icon]}</span>
                <span className="text-sm">{list.name}</span>
              </label>
            </li>
          ))}
          <li className="mt-1 border-t pt-1">
            <label className="flex cursor-pointer items-center gap-3 rounded-md px-1 py-2 hover:bg-muted">
              <input
                type="checkbox"
                className="size-4"
                checked={current?.label === "hotel"}
                onChange={(e) =>
                  savedStore.update((s) =>
                    setHotel(s, e.target.checked ? place : null),
                  )
                }
              />
              <span aria-hidden="true">🏨</span>
              <span className="text-sm">
                My hotel
                <span className="block text-xs text-muted-foreground">
                  The app opens with this as your starting point
                </span>
              </span>
            </label>
          </li>
        </ul>

        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (newName.trim()) createList();
          }}
        >
          <input
            aria-label="New list name"
            placeholder="+ New list"
            maxLength={80}
            className="min-w-0 flex-1 rounded-md border bg-background px-2 py-1.5 text-sm"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <button
            type="submit"
            aria-label="Add list"
            disabled={!newName.trim()}
            className="rounded-md border px-3 text-sm disabled:opacity-50"
          >
            Add
          </button>
        </form>

        <button
          type="button"
          className="rounded-full bg-blue-600 py-2 text-sm font-semibold text-white"
          onClick={onClose}
        >
          Done
        </button>
      </div>
    </div>
  );
}
