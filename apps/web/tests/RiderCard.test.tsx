import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { MyRiderCard } from "@/components/RiderCard";
import { riderStore } from "@/lib/game/rider";

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <QueryClientProvider client={new QueryClient()}>
      <button type="button" onClick={() => setOpen(true)}>
        Open card
      </button>
      {open && <MyRiderCard onClose={() => setOpen(false)} />}
    </QueryClientProvider>
  );
}

beforeEach(() => {
  localStorage.clear();
  riderStore.reset();
});

describe("rider card dialog focus (review fixes)", () => {
  it("returns focus to what opened it", () => {
    render(<Harness />);
    const opener = screen.getByRole("button", { name: "Open card" });
    opener.focus();
    fireEvent.click(opener);
    const dialog = screen.getByRole("dialog", { name: "Rider card" });
    expect(dialog).toHaveFocus();
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(opener).toHaveFocus();
  });

  it("keeps Tab inside: from the last control back to the first", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Open card" }));
    const dialog = screen.getByRole("dialog", { name: "Rider card" });
    const controls = Array.from(
      dialog.querySelectorAll<HTMLElement>("button, input"),
    );
    controls[controls.length - 1].focus();
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(controls[0]).toHaveFocus();
    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(controls[controls.length - 1]).toHaveFocus();
  });
});
