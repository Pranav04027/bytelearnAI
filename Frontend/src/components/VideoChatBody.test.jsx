import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import VideoChatBody from "./VideoChatBody.jsx";

vi.mock("../api/axios.js", () => ({ default: { defaults: { baseURL: "/api/v1" } } }));
const source = { sourceId: 1, chunkIndex: 3, startMs: 12000, endMs: 18000, similarity: 0.9 };
const event = (name, data) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;
const answer = "Café 😊 [Source 1].";
const frames = () => event("start", { videoId: "A" })
  + event("token", { text: "Café " }) + event("token", { text: "😊 [Source 1]." })
  + event("done", { answer, sources: [source] });
const encoder = new TextEncoder();
function streamed(chunks) {
  return new Response(new ReadableStream({ start(controller) {
    for (const chunk of chunks) controller.enqueue(typeof chunk === "string" ? encoder.encode(chunk) : chunk);
    controller.close();
  } }), { headers: { "Content-Type": "text/event-stream" } });
}
function heldStream() {
  let controller;
  const cancel = vi.fn();
  const response = new Response(new ReadableStream({ start(c) { controller = c; }, cancel }));
  return { response, cancel, push: (text) => controller.enqueue(encoder.encode(text)), close: () => controller.close() };
}
const send = (question = "Explain closures.", view = screen) => {
  fireEvent.change(view.getByPlaceholderText("Ask a question..."), { target: { value: question } });
  fireEvent.click(view.getByRole("button", { name: "Send" }));
};
const finish = () => waitFor(() => expect(screen.getByPlaceholderText("Ask a question...").disabled).toBe(false));
const storedId = (video = "A") => sessionStorage.getItem(`bytelearn:conversation:${video}`);
const sent = (index = 0) => JSON.parse(fetch.mock.calls[index][1].body);

beforeEach(() => {
  sessionStorage.clear();
  vi.stubGlobal("fetch", vi.fn(async () => streamed([frames()])));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("conversation identity and lifecycle", () => {
  it("retains one UUID per video and sends it on each request, including after remount", async () => {
    let view = render(<VideoChatBody videoId="A" />);
    send(); await finish();
    const id = storedId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(sent()).toEqual({ videoId: "A", question: "Explain closures.", conversationId: id });
    send("Why?"); await finish();
    expect(sent(1).conversationId).toBe(id);
    view.rerender(<VideoChatBody videoId="B" />);
    expect(screen.queryByText("Why?")).toBeNull();
    send(); await finish();
    expect(storedId("B")).not.toBe(id);
    expect(sent(2).conversationId).toBe(storedId("B"));
    view.unmount();
    view = render(<VideoChatBody videoId="A" />);
    expect(screen.getByText("Have any Questions?")).toBeTruthy();
    expect(screen.queryByText("Café", { exact: false })).toBeNull();
    send("How so?"); await finish();
    expect(sent(3).conversationId).toBe(id);
    view.unmount();
  });

  it("aborts before replacing the stored ID, clears chat, and ignores stale output and cleanup", async () => {
    const held = heldStream();
    fetch.mockResolvedValueOnce(held.response);
    render(<VideoChatBody videoId="A" />);
    send();
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const oldId = storedId();
    const signal = fetch.mock.calls[0][1].signal;
    const idAtAbort = [];
    signal.addEventListener("abort", () => idAtAbort.push(storedId()));
    await act(async () => held.push(event("token", { text: "Draft content" })));
    expect(screen.getByText("Draft content")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "New conversation" }));
    expect(signal.aborted).toBe(true);
    expect(idAtAbort).toEqual([oldId]);
    expect(storedId()).not.toBe(oldId);
    expect(screen.queryByText("Draft content")).toBeNull();
    expect(screen.queryByText("Explain closures.")).toBeNull();
    const second = heldStream();
    fetch.mockResolvedValueOnce(second.response);
    send("Fresh question");
    await act(async () => held.push(event("done", { answer: "STALE", sources: [] })));
    expect(screen.queryByText("STALE")).toBeNull();
    expect(screen.getByRole("button", { name: "Send" }).disabled).toBe(true);
    await act(async () => second.push(frames()));
    await finish();
    expect(sent(1).conversationId).toBe(storedId());
    expect(held.cancel).toHaveBeenCalledTimes(1);
  });

  it("resets both mounted views of a video and leaves other videos alone", async () => {
    const a = render(<VideoChatBody videoId="A" />);
    const b = render(<VideoChatBody videoId="A" />);
    const other = render(<VideoChatBody videoId="B" />);
    const first = heldStream();
    const second = heldStream();
    fetch.mockResolvedValueOnce(first.response).mockResolvedValueOnce(second.response);
    send("A first", within(a.container));
    send("A second", within(b.container));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    const oldId = storedId();
    expect(sent(1).conversationId).toBe(oldId);
    fireEvent.change(within(other.container).getByPlaceholderText("Ask a question..."), { target: { value: "Keep this input" } });
    fireEvent.click(within(a.container).getByRole("button", { name: "New conversation" }));
    expect(fetch.mock.calls.slice(0, 2).every(([, opts]) => opts.signal.aborted)).toBe(true);
    expect(storedId()).not.toBe(oldId);
    expect(within(a.container).getByText("Have any Questions?")).toBeTruthy();
    expect(within(b.container).getByText("Have any Questions?")).toBeTruthy();
    expect(within(other.container).getByPlaceholderText("Ask a question...").value).toBe("Keep this input");
    await act(async () => { first.close(); second.close(); });
    send("New from second view", within(b.container));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
    expect(sent(2).conversationId).toBe(storedId());
  });

  it.each(["unmount", "video change"])("aborts the active fetch on %s", async (action) => {
    const held = heldStream();
    fetch.mockResolvedValueOnce(held.response);
    const view = render(<VideoChatBody videoId="A" />);
    send();
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const signal = fetch.mock.calls[0][1].signal;
    if (action === "unmount") view.unmount();
    else view.rerender(<VideoChatBody videoId="B" />);
    expect(signal.aborted).toBe(true);
    await act(async () => held.close());
  });

  it("repairs an invalid stored ID and blocks reuse when a deliberate reset cannot save", async () => {
    sessionStorage.setItem("bytelearn:conversation:A", "broken");
    render(<VideoChatBody videoId="A" />);
    send(); await finish();
    expect(sent().conversationId).not.toBe("broken");
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("storage unavailable"); });
    fireEvent.click(screen.getByRole("button", { name: "New conversation" }));
    expect(screen.getByRole("alert").textContent).toContain("Unable to start");
    send("Must not resume the old ID");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe("incremental SSE and citations", () => {
  const bytes = encoder.encode(frames());
  const cases = [
    ["coalesced", [bytes]],
    ["byte-at-a-time UTF-8", Array.from(bytes, (byte) => Uint8Array.of(byte))],
    ["split field and delimiter", [bytes.slice(0, 4), bytes.slice(4, 41), bytes.slice(41, -1), bytes.slice(-1)]],
    ["CRLF", [frames().replaceAll("\n", "\r\n")]],
  ];
  it.each(cases)("parses %s reads and keeps timestamp seeking", async (_name, chunks) => {
    fetch.mockResolvedValueOnce(streamed(chunks));
    const seek = vi.fn();
    render(<VideoChatBody videoId="A" onSeekToMs={seek} />);
    send(); await finish();
    expect(screen.getByText("Café 😊", { exact: false })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    const chip = screen.getByTitle("Jump to 00:12");
    fireEvent.click(chip);
    expect(seek).toHaveBeenCalledExactlyOnceWith(12000);
    expect(screen.getAllByTitle("Jump to 00:12")).toHaveLength(1);
  });

  it("renders ordered tokens before done, then uses the authoritative final answer exactly once", async () => {
    const held = heldStream();
    fetch.mockResolvedValueOnce(held.response);
    render(<VideoChatBody videoId="A" />);
    send();
    await act(async () => held.push(event("start", { videoId: "A" }) + event("token", { text: "First" })));
    expect(screen.getByText("First")).toBeTruthy();
    await act(async () => held.push(event("token", { text: " second" })));
    expect(screen.getByText("First second")).toBeTruthy();
    await act(async () => held.push(event("done", { answer: "Final text", sources: [] })
      + event("done", { answer: "DUPLICATE", sources: [] }) + event("error", { message: "late error" })));
    await finish();
    expect(screen.getAllByText("Final text")).toHaveLength(1);
    expect(screen.queryByText("DUPLICATE")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(held.cancel).toHaveBeenCalledTimes(1);
  });

  it.each(["error event", "truncated frame", "missing done", "invalid JSON"])("rejects %s without retaining a completed draft, and permits retry", async (failure) => {
    const endings = { "error event": event("error", { message: "failure" }), "truncated frame": 'event: done\ndata: {"answer":', "missing done": "", "invalid JSON": "event: token\ndata: not-json\n\n" };
    fetch.mockResolvedValueOnce(streamed([event("token", { text: "Partial draft" }) + endings[failure]]));
    render(<VideoChatBody videoId="A" />);
    send(); await finish();
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(screen.queryByText("Partial draft")).toBeNull();
    const id = storedId();
    send("Try again"); await finish();
    expect(sent(1).conversationId).toBe(id);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("handles overlap rejection clearly and allows a retry with the same ID", async () => {
    fetch.mockResolvedValueOnce(new Response("{}", { status: 409 }));
    render(<VideoChatBody videoId="A" />);
    send(); await finish();
    expect(screen.getByRole("alert").textContent).toContain("already running");
    send("Try again"); await finish();
    expect(sent(1).conversationId).toBe(sent().conversationId);
  });

  it("renders canonical abstention once, without citation chips", async () => {
    const abstention = "I couldn't find enough information in this video to answer that.";
    fetch.mockResolvedValueOnce(streamed([event("start", { videoId: "A" }) + event("token", { text: abstention })
      + event("done", { answer: abstention, sources: [] })]));
    render(<VideoChatBody videoId="A" />);
    send(); await finish();
    expect(screen.getAllByText("Not covered in this video")).toHaveLength(1);
    expect(screen.queryByTitle(/Jump to/)).toBeNull();
  });
});
