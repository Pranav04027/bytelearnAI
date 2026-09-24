import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ add: vi.fn(async () => {}), search: vi.fn(async () => ({ results: [{ content: "existing quiz memory" }] })) }));
vi.mock("supermemory", () => ({ default: vi.fn(class {
  constructor() { this.add = mocks.add; this.search = { documents: mocks.search }; }
}) }));
import Supermemory from "supermemory";
import { saveInMem, retriveFromMem } from "../utils/supermemory.js";
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
it("keeps existing quiz memory calls and tags while constructing the client only on demand", async () => {
  expect(Supermemory).not.toHaveBeenCalled();
  vi.stubEnv("SUPERMEMORY_API_KEY", "quiz-key");
  vi.spyOn(console, "log").mockImplementation(() => {});
  await saveInMem("learner", "quiz summary");
  expect(await retriveFromMem("learner")).toBe("existing quiz memory");
  expect(Supermemory).toHaveBeenCalledExactlyOnceWith({ apiKey: "quiz-key" });
  expect(mocks.add).toHaveBeenCalledWith({ content: "quiz summary", containerTags: ["user_learner"], metadata: { timestamp: expect.any(String) } });
  expect(mocks.search).toHaveBeenCalledWith({ q: "What technical concepts or topics does this student struggle with?", containerTags: ["user_learner"] });
});
