import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { SaveButton } from "@/components/SaveButton";
import {
  findPlace,
  hotelOf,
  type PlaceInput,
  savedStore,
} from "@/lib/saved-places";

const hotel: PlaceInput = {
  id: "osm-node-1",
  name: "Hotel Hakuba",
  coord: { lat: 36.698, lng: 137.861 },
  kind: "lodging",
};
const inn: PlaceInput = { ...hotel, id: "osm-node-9", name: "Inn" };

beforeEach(() => {
  localStorage.clear();
  savedStore.reset();
});

describe("SaveButton", () => {
  it("shows an empty star until the place is in a list", () => {
    render(<SaveButton place={hotel} />);
    const button = screen.getByRole("button", { name: "Save Hotel Hakuba" });
    expect(button).toHaveTextContent("☆");
    expect(button).toHaveAttribute("aria-pressed", "false");
  });

  it("toggles lists in the picker and turns the star on", () => {
    render(<SaveButton place={hotel} />);
    fireEvent.click(screen.getByRole("button", { name: "Save Hotel Hakuba" }));
    const dialog = screen.getByRole("dialog", { name: "Save to list" });
    expect(dialog).toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox", { name: /Starred/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Want to go/ }));
    expect(findPlace(savedStore.getSnapshot(), hotel.id)?.lists).toEqual([
      "starred",
      "want-to-go",
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const saved = screen.getByRole("button", { name: "Saved: Hotel Hakuba" });
    expect(saved).toHaveTextContent("★");
    expect(saved).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(saved);
    fireEvent.click(screen.getByRole("checkbox", { name: /Starred/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Want to go/ }));
    expect(findPlace(savedStore.getSnapshot(), hotel.id)).toBeUndefined();
  });

  it("creates a new list with the place already in it", () => {
    render(<SaveButton place={hotel} />);
    fireEvent.click(screen.getByRole("button", { name: "Save Hotel Hakuba" }));
    fireEvent.change(screen.getByRole("textbox", { name: "New list name" }), {
      target: { value: "Onsen" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add list" }));
    expect(screen.getByRole("checkbox", { name: /Onsen/ })).toBeChecked();
    const lists = savedStore.getSnapshot().lists;
    expect(lists.at(-1)?.name).toBe("Onsen");
  });

  it("moves the My hotel label between places", () => {
    const { unmount } = render(<SaveButton place={hotel} />);
    fireEvent.click(screen.getByRole("button", { name: "Save Hotel Hakuba" }));
    fireEvent.click(screen.getByRole("checkbox", { name: /My hotel/ }));
    expect(hotelOf(savedStore.getSnapshot())?.id).toBe(hotel.id);
    unmount();

    render(<SaveButton place={inn} />);
    fireEvent.click(screen.getByRole("button", { name: "Save Inn" }));
    fireEvent.click(screen.getByRole("checkbox", { name: /My hotel/ }));
    expect(hotelOf(savedStore.getSnapshot())?.id).toBe(inn.id);
    expect(findPlace(savedStore.getSnapshot(), hotel.id)).toBeUndefined();
  });

  it("closes on Escape", () => {
    render(<SaveButton place={hotel} />);
    fireEvent.click(screen.getByRole("button", { name: "Save Hotel Hakuba" }));
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
