// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthTokenPanel } from "./AuthTokenPanel.js";

afterEach(() => {
  cleanup();
  sessionStorage.clear();
});

describe("AuthTokenPanel", () => {
  it("saves a tab-scoped token and clears both the input and storage", async () => {
    const user = userEvent.setup();
    const onTokenChanged = vi.fn();
    render(<AuthTokenPanel onTokenChanged={onTokenChanged} />);

    const input = screen.getByLabelText("API / MCP token");
    await user.type(input, "operator-token");
    await user.click(screen.getByRole("button", { name: "Set token" }));

    expect(sessionStorage.getItem("HIVEMAP_UI_TOKEN")).toBe("operator-token");
    expect(onTokenChanged).toHaveBeenNthCalledWith(1, true);

    await user.click(screen.getByRole("button", { name: "Clear token" }));

    expect(sessionStorage.getItem("HIVEMAP_UI_TOKEN")).toBeNull();
    expect((input as HTMLInputElement).value).toBe("");
    expect((screen.getByRole("button", { name: "Clear token" }) as HTMLButtonElement).disabled).toBe(true);
    expect(onTokenChanged).toHaveBeenNthCalledWith(2, false);
  });
});
