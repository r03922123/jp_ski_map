import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import {
  shouldShowTitle,
  TITLE_COOKIE,
  TitleScreen,
} from "@/components/TitleScreen";

const clearCookie = () => {
  // biome-ignore lint/suspicious/noDocumentCookie: test setup
  document.cookie = `${TITLE_COOKIE}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
};

describe("shouldShowTitle (SPEC-web-app v1.6)", () => {
  it("shows on a fresh visit to the bare page", () => {
    expect(shouldShowTitle({ search: "", hash: "", cookie: "" })).toBe(true);
  });
  it("not twice in a session", () => {
    expect(
      shouldShowTitle({ search: "", hash: "", cookie: `${TITLE_COOKIE}=seen` }),
    ).toBe(false);
  });
  it("never in front of a shared link, or with ?skip-title", () => {
    for (const search of [
      "?from=36.7,137.8",
      "?resort=happo-one",
      "?dest=pt:1,2",
      "?skip-title",
    ])
      expect(shouldShowTitle({ search, hash: "", cookie: "" }), search).toBe(
        false,
      );
    for (const hash of ["#import=abc", "#rider=abc"])
      expect(shouldShowTitle({ search: "", hash, cookie: "" }), hash).toBe(
        false,
      );
  });
});

describe("TitleScreen", () => {
  beforeEach(clearCookie);

  it("starts on Enter (or a tap) and remembers it for the session", () => {
    render(<TitleScreen />);
    const start = screen.getByRole("button", { name: /tap to start/i });
    expect(
      screen.getByRole("dialog", { name: "Hakuba Valley" }),
    ).toBeInTheDocument();
    expect(start).toHaveFocus();
    act(() => fireEvent.click(start));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.cookie).toContain(`${TITLE_COOKIE}=seen`);
  });
});

describe("TitleScreen focus (review fixes)", () => {
  beforeEach(clearCookie);

  it("Tab stays on the start button, and starting hands focus to the search box", () => {
    render(
      <main>
        <input
          role="combobox"
          aria-label="Search hotel or place"
          aria-expanded={false}
          aria-controls="x"
        />
        <TitleScreen />
      </main>,
    );
    const start = screen.getByRole("button", { name: /tap to start/i });
    fireEvent.keyDown(start, { key: "Tab" });
    expect(start).toHaveFocus();
    act(() => fireEvent.click(start));
    expect(
      screen.getByRole("combobox", { name: "Search hotel or place" }),
    ).toHaveFocus();
  });
});
