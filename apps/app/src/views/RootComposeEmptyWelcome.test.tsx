// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RootComposeEmptyWelcome } from "./RootComposeEmptyWelcome";

afterEach(cleanup);

describe("RootComposeEmptyWelcome", () => {
  it("replaces the bb logo with Tom Cruise giving a thumbs up", () => {
    render(
      <RootComposeEmptyWelcome onCompose={vi.fn()} onAddProject={vi.fn()} />,
    );

    expect(
      screen.getByRole("img", {
        name: "Tom Cruise giving a thumbs up",
      }),
    ).toBeTruthy();
    expect(screen.queryByRole("img", { name: "bb" })).toBeNull();
  });
});
