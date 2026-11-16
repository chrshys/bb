// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { ChatsSection } from "../components/chats-section";

beforeEach(() => localStorage.clear());
afterEach(() => { cleanup(); localStorage.clear(); });
const content = <a href="/threads/example">A chat</a>;

it("persists collapsed chats across remounts and restores the list on expansion", () => {
  const view = render(<ChatsSection onNewChat={() => {}} activeChatId={null}>{content}</ChatsSection>);
  fireEvent.click(view.getByRole("button", { name: "Chats" }));
  expect(view.queryByRole("link", { name: "A chat" })).toBeNull();
  view.unmount();
  const again = render(<ChatsSection onNewChat={() => {}} activeChatId={null}>{content}</ChatsSection>);
  expect(again.getByRole("button", { name: "Chats" }).getAttribute("aria-expanded")).toBe("false");
  expect(again.queryByRole("link", { name: "A chat" })).toBeNull();
  fireEvent.click(again.getByRole("button", { name: "Chats" }));
  expect(again.getByRole("link", { name: "A chat" })).toBeTruthy();
});

it("reveals a newly navigated chat while preserving deliberate collapse of the current chat", () => {
  const view = render(<ChatsSection onNewChat={() => {}} activeChatId="one">{content}</ChatsSection>);
  fireEvent.click(view.getByRole("button", { name: "Chats" }));
  view.rerender(<ChatsSection onNewChat={() => {}} activeChatId="one">{content}</ChatsSection>);
  expect(view.queryByRole("link", { name: "A chat" })).toBeNull();
  view.rerender(<ChatsSection onNewChat={() => {}} activeChatId="two">{content}</ChatsSection>);
  expect(view.getByRole("link", { name: "A chat" })).toBeTruthy();
});
