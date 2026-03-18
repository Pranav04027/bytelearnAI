import { mock, test, expect } from "bun:test";
mock.module("./src/db/index.js", () => {
    return { prisma: "MOCKED" };
});

import { prisma } from "./src/db/index.js";

test("mocking works", () => {
    expect(prisma).toBe("MOCKED");
});
