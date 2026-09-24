import { afterEach, expect, it, vi } from "vitest";
const behavior = vi.hoisted(() => ({ boundary: "before" }));
vi.mock("langsmith/traceable", () => ({
  traceable: vi.fn(fn => async () => {
    if (behavior.boundary === "after") await fn();
    throw new Error("instrumentation failed");
  }),
}));
import { trace, __setClientForTesting, __resetClientForTesting } from "../observability/langsmithTracer.js";
import { traceable } from "langsmith/traceable";
afterEach(() => { __resetClientForTesting(); vi.clearAllMocks(); });

it.each(["before", "after"])("instrumentation failure %s execution never repeats work or creates another root", async boundary => {
  behavior.boundary = boundary;
  __setClientForTesting({});
  const work = vi.fn(async () => "grounded answer");
  expect(await trace("request", work)).toBe("grounded answer");
  expect(work).toHaveBeenCalledTimes(1);
  expect(traceable).toHaveBeenCalledTimes(1);
});

it("preserves the original application exception without retrying failed work", async () => {
  behavior.boundary = "after";
  __setClientForTesting({});
  const error = new Error("provider failed");
  const work = vi.fn(async () => { throw error; });
  await expect(trace("request", work)).rejects.toBe(error);
  expect(work).toHaveBeenCalledTimes(1);
});
