import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SavedPanel } from "@/components/SavedPanel";
import {
  addList,
  findPlace,
  type PlaceInput,
  savedStore,
  setHotel,
  toggleInList,
} from "@/lib/saved-places";

const hotel: PlaceInput = {
  id: "osm-node-1",
  name: "Hotel Hakuba",
  coord: { lat: 36.698, lng: 137.861 },
  kind: "lodging",
};
const ramen: PlaceInput = {
  id: "osm-node-2",
  name: "Ramen Shop",
  coord: { lat: 36.7, lng: 137.85 },
  kind: "poi",
};

beforeEach(() => {
  localStorage.clear();
  savedStore.reset();
  savedStore.update((s) =>
    toggleInList(
      toggleInList(setHotel(s, hotel), ramen, "favorites"),
      hotel,
      "starred",
    ),
  );
});

function setup() {
  const onStartFrom = vi.fn();
  const onGoHere = vi.fn();
  const onClose = vi.fn();
  render(
    <SavedPanel
      onStartFrom={onStartFrom}
      onGoHere={onGoHere}
      onClose={onClose}
      canGoHere
    />,
  );
  return { onStartFrom, onGoHere, onClose };
}

describe("SavedPanel", () => {
  it("lists My hotel and every list with its count", () => {
    setup();
    expect(
      screen.getByRole("button", { name: /My hotel.*Hotel Hakuba/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Starred.*1 place/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Favorites.*1 place/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Want to go.*0 places/ }),
    ).toBeInTheDocument();
  });

  it("opens a list and starts from or goes to a place", () => {
    const { onStartFrom, onGoHere } = setup();
    fireEvent.click(screen.getByRole("button", { name: /Favorites/ }));
    const item = screen.getByRole("listitem", { name: "Ramen Shop" });
    fireEvent.click(
      within(item).getByRole("button", { name: "Start from here" }),
    );
    expect(onStartFrom).toHaveBeenCalledWith(
      expect.objectContaining({ id: ramen.id }),
    );
    fireEvent.click(within(item).getByRole("button", { name: "Go here" }));
    expect(onGoHere).toHaveBeenCalledWith(
      expect.objectContaining({ id: ramen.id }),
    );
  });

  it("removes a place from the open list and edits its note", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: /Favorites/ }));
    const item = screen.getByRole("listitem", { name: "Ramen Shop" });
    fireEvent.change(within(item).getByRole("textbox", { name: "Note" }), {
      target: { value: "Try the miso" },
    });
    fireEvent.blur(within(item).getByRole("textbox", { name: "Note" }));
    expect(findPlace(savedStore.getSnapshot(), ramen.id)?.note).toBe(
      "Try the miso",
    );

    fireEvent.click(
      within(item).getByRole("button", { name: "Remove from Favorites" }),
    );
    expect(findPlace(savedStore.getSnapshot(), ramen.id)).toBeUndefined();
    expect(screen.getByText("No places in this list yet.")).toBeInTheDocument();
  });

  it("hides a list from the map and deletes custom lists only", () => {
    savedStore.update((s) => addList(s, "Onsen", "bookmark")?.state ?? s);
    setup();
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Show Starred on map" }),
    );
    expect(
      savedStore.getSnapshot().lists.find((l) => l.id === "starred")?.hidden,
    ).toBe(true);
    expect(
      screen.queryByRole("button", { name: "Delete list Starred" }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Delete list Onsen" }));
    expect(savedStore.getSnapshot().lists.map((l) => l.name)).not.toContain(
      "Onsen",
    );
  });

  it("opens straight to a place when focused (a tapped map marker)", () => {
    render(
      <SavedPanel
        focusId={ramen.id}
        onStartFrom={vi.fn()}
        onGoHere={vi.fn()}
        onClose={vi.fn()}
        canGoHere
      />,
    );
    expect(
      screen.getByRole("listitem", { name: "Ramen Shop" }),
    ).toBeInTheDocument();
  });

  it("says where the data lives", () => {
    setup();
    expect(screen.getByText(/stored on this device/i)).toBeInTheDocument();
  });
});
