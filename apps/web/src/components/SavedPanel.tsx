"use client";

import { useState } from "react";
import { LIST_ICONS } from "@/components/ListPicker";
import {
  deleteList,
  findPlace,
  hotelOf,
  type SavedPlace,
  savedStore,
  setListHidden,
  setNote,
  toggleInList,
  useSaved,
} from "@/lib/saved-places";

type Props = {
  onStartFrom: (place: SavedPlace) => void;
  onGoHere: (place: SavedPlace) => void;
  onClose: () => void;
  /** "Go here" needs drive or walk mode; shuttles only serve resorts. */
  canGoHere: boolean;
  /** Open straight to this place (a saved marker tapped on the map). */
  focusId?: string | null;
  /** Share a list (wired by the share task); hidden when absent. */
  onShareList?: (listId: string) => void;
};

/** Google's "Saved" tab: lists → places → start from / go here. */
export function SavedPanel({
  onStartFrom,
  onGoHere,
  onClose,
  canGoHere,
  focusId = null,
  onShareList,
}: Props) {
  const state = useSaved();
  const [openList, setOpenList] = useState<string | null>(null);
  const focused = focusId ? findPlace(state, focusId) : undefined;
  const list = state.lists.find((l) => l.id === openList);
  const hotel = hotelOf(state);
  const actions = { onStartFrom, onGoHere, canGoHere };

  return (
    <section aria-label="Saved" className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        {list && (
          <button
            type="button"
            aria-label="Back to lists"
            className="rounded-full px-2 hover:bg-muted"
            onClick={() => setOpenList(null)}
          >
            ←
          </button>
        )}
        <h2 className="flex-1 font-semibold">
          {list ? `${LIST_ICONS[list.icon]} ${list.name}` : "★ Saved"}
        </h2>
        <button
          type="button"
          aria-label="Close saved"
          className="rounded-full px-2 text-muted-foreground hover:bg-muted"
          onClick={onClose}
        >
          ✕
        </button>
      </div>

      {focused && openList === null && (
        <ul>
          <PlaceItem place={focused} {...actions} />
        </ul>
      )}

      {list ? (
        <ul className="flex flex-col gap-2">
          {state.places
            .filter((p) => p.lists.includes(list.id))
            .map((p) => (
              <PlaceItem
                key={p.id}
                place={p}
                {...actions}
                removeLabel={`Remove from ${list.name}`}
                onRemove={() =>
                  savedStore.update((s) => toggleInList(s, p, list.id))
                }
              />
            ))}
          {!state.places.some((p) => p.lists.includes(list.id)) && (
            <p className="text-sm text-muted-foreground">
              No places in this list yet.
            </p>
          )}
          {onShareList && (
            <button
              type="button"
              className="self-start text-sm text-blue-700 underline"
              onClick={() => onShareList(list.id)}
            >
              Share this list
            </button>
          )}
        </ul>
      ) : (
        <>
          {hotel && (
            <button
              type="button"
              className="flex items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm hover:bg-muted"
              onClick={() => onStartFrom(hotel)}
            >
              <span aria-hidden="true">🏨</span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium">My hotel</span>
                <span className="block truncate text-muted-foreground">
                  {hotel.name}
                </span>
              </span>
            </button>
          )}
          <ul className="flex flex-col">
            {state.lists.map((l) => {
              const count = state.places.filter((p) =>
                p.lists.includes(l.id),
              ).length;
              return (
                <li key={l.id} className="flex items-center gap-1">
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-3 rounded-md px-1 py-2 text-left text-sm hover:bg-muted"
                    onClick={() => setOpenList(l.id)}
                  >
                    <span aria-hidden="true">{LIST_ICONS[l.icon]}</span>
                    <span className="min-w-0 flex-1 truncate">{l.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {count} {count === 1 ? "place" : "places"}
                    </span>
                  </button>
                  <label className="flex items-center px-1" title="Show on map">
                    <input
                      type="checkbox"
                      aria-label={`Show ${l.name} on map`}
                      checked={!l.hidden}
                      onChange={(e) =>
                        savedStore.update((s) =>
                          setListHidden(s, l.id, !e.target.checked),
                        )
                      }
                    />
                  </label>
                  {!l.builtIn && (
                    <button
                      type="button"
                      aria-label={`Delete list ${l.name}`}
                      className="rounded-full px-2 text-muted-foreground hover:bg-muted"
                      onClick={() =>
                        savedStore.update((s) => deleteList(s, l.id))
                      }
                    >
                      🗑
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-muted-foreground">
            Saved places are stored on this device only. Share a list to keep a
            copy or move it to your phone.
          </p>
        </>
      )}
    </section>
  );
}

function PlaceItem({
  place,
  onStartFrom,
  onGoHere,
  canGoHere,
  removeLabel,
  onRemove,
}: {
  place: SavedPlace;
  onStartFrom: (p: SavedPlace) => void;
  onGoHere: (p: SavedPlace) => void;
  canGoHere: boolean;
  removeLabel?: string;
  onRemove?: () => void;
}) {
  const [note, setNoteText] = useState(place.note ?? "");
  return (
    <li
      aria-label={place.name}
      className="flex flex-col gap-1.5 rounded-lg border px-3 py-2 text-sm"
    >
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate font-medium">
          {place.label === "hotel" && <span aria-hidden="true">🏨 </span>}
          {place.name}
        </span>
        {onRemove && removeLabel && (
          <button
            type="button"
            aria-label={removeLabel}
            className="rounded-full px-2 text-muted-foreground hover:bg-muted"
            onClick={onRemove}
          >
            ✕
          </button>
        )}
      </div>
      <input
        aria-label="Note"
        placeholder="Add a note"
        maxLength={140}
        className="rounded-md border bg-background px-2 py-1 text-xs"
        value={note}
        onChange={(e) => setNoteText(e.target.value)}
        onBlur={() => savedStore.update((s) => setNote(s, place.id, note))}
      />
      <div className="flex gap-2">
        <button
          type="button"
          className="rounded-full border px-3 py-1 text-xs font-medium hover:bg-muted"
          onClick={() => onStartFrom(place)}
        >
          Start from here
        </button>
        <button
          type="button"
          disabled={!canGoHere}
          title={canGoHere ? undefined : "Switch to Drive or Walk"}
          className="rounded-full bg-blue-600 px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
          onClick={() => onGoHere(place)}
        >
          Go here
        </button>
      </div>
    </li>
  );
}
