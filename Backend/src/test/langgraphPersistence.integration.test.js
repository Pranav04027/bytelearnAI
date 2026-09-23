import { randomUUID, createHash } from "node:crypto";
import { expect, it, vi } from "vitest";
import { createPostgresCheckpointer, readLangGraphDatabaseUrl } from "../graphs/postgresCheckpointer.js";
import { createConversationalRagRuntime } from "../graphs/conversationalRagRuntime.js";

// Never load .env. This flag is an operator assertion, not proof of target safety.
it.skipIf(process.env.LANGGRAPH_TEST_DATABASE_CONFIRMED !== "true")(
  "restores bounded pairs through new PostgreSQL pools, retains old snapshots and isolates scoped threads", async () => {
    const url = new URL(readLangGraphDatabaseUrl());
    if (process.env.NODE_ENV === "production" || /prod(?:uction)?/i.test(url.hostname + url.pathname)) {
      throw new Error("Integration requires an explicitly safe non-production database");
    }
    const videoId = `stage5-test-${randomUUID()}`;
    const conversationId = randomUUID();
    const thread = (video, id) => createHash("sha256").update(JSON.stringify([video, id.toLowerCase()])).digest("hex");
    const ids = [thread(videoId, conversationId), thread(videoId, randomUUID()), thread(`${videoId}-other`, conversationId),
      thread(videoId, randomUUID()), thread(videoId, randomUUID())];
    const config = i => ({ configurable: { thread_id: ids[i] } });
    const runtimes = [];
    const resources = [];
    const retrieve = vi.fn(async () => [{
      content: "Closures capture lexical bindings.", chunkIndex: 1, startMs: 1000, endMs: 2000, similarity: .9,
      client: { secret: "EXCLUDED_RUNTIME_SECRET" },
    }]);
    const generate = vi.fn(async () => "Closures capture bindings [Source 1].");
    function fresh(overrides = {}) {
      const runtime = createConversationalRagRuntime({
        createCheckpointer: () => {
          const resource = createPostgresCheckpointer();
          resources.push(resource);
          return resource;
        }, retrieve, generate, ...overrides,
      });
      runtimes.push(runtime);
      return runtime;
    }
    let failure;
    try {
      const first = fresh();
      await first.invoke({ videoId, question: "Explain closures." }, config(0));
      const firstSnapshot = await first.getState(config(0));
      const q1 = firstSnapshot.values;
      expect(q1.status).toBe("complete");
      expect(q1.messages.map(m => m.getType())).toEqual(["human", "ai"]);
      await first.close();
      const second = fresh();
      const restored = (await second.getState(config(0))).values;
      expect(restored.messages.map(m => m.getType())).toEqual(["human", "ai"]);
      await second.invoke({ videoId, question: "Why?" }, { ...config(0), signal: new AbortController().signal, onToken: () => {} });
      expect(retrieve).toHaveBeenLastCalledWith(videoId, "Explain closures.\nWhy?");
      expect(generate.mock.calls.at(-1)[0].previousQuestion).toBe("Explain closures.");
      const complete = (await second.getState(config(0))).values;
      expect(complete.messages.map(m => m.getType())).toEqual(["human", "ai", "human", "ai"]);
      expect(complete.status).toBe("complete");
      expect(Object.keys(complete).sort()).toEqual([
        "messages", "videoId", "question", "retrievalQuery", "matches", "answer", "sources", "status",
      ].sort());
      expect(complete.sources).toEqual([{ sourceId: 1, chunkIndex: 1, startMs: 1000, endMs: 2000, similarity: .9 }]);
      expect(JSON.stringify(complete)).not.toMatch(/EXCLUDED_RUNTIME_SECRET|onToken|AbortController/);
      for (const [i, video] of [[1, videoId], [2, `${videoId}-other`]]) {
        await second.invoke({ videoId: video, question: "Why?" }, config(i));
        expect(retrieve).toHaveBeenLastCalledWith(video, "Why?");
        expect(generate.mock.calls.at(-1)[0].previousQuestion).toBeUndefined();
        expect((await second.getState(config(i))).values.messages).toHaveLength(2);
      }
      const expectedQuestions = ["Explain closures.", "Why?"];
      const retainedIds = new Map(complete.messages.filter(m => m.getType() === "human").map(m => [m.content, m.id]));
      let latest;
      for (let n = 3; n <= 10; n += 1) {
        const question = `Question ${n}`;
        expectedQuestions.push(question);
        latest = await second.invoke({ videoId, question }, config(0));
        expect(latest.messages.map(m => m.getType())).toEqual(
          Array.from({ length: Math.min(n, 4) }, () => ["human", "ai"]).flat(),
        );
        expect(latest.messages.filter(m => m.getType() === "human").map(m => m.content)).toEqual(expectedQuestions.slice(-4));
        expect(latest.messages.every(m => typeof m.id === "string" && m.id.length > 0)).toBe(true);
        for (const human of latest.messages.filter(m => m.getType() === "human")) {
          if (retainedIds.has(human.content)) expect(human.id).toBe(retainedIds.get(human.content));
          retainedIds.set(human.content, human.id);
        }
      }
      const beforeRestart = latest.messages.map(m => [m.getType(), m.content, m.id]);
      await second.close();
      const third = fresh();
      const bounded = (await third.getState(config(0))).values;
      expect(bounded.messages.map(m => [m.getType(), m.content, m.id])).toEqual(beforeRestart);
      expect(bounded.messages.filter(m => m.getType() === "human").map(m => m.content)).toEqual([
        "Question 7", "Question 8", "Question 9", "Question 10",
      ]);
      const saver = await resources.at(-1).ready;
      const storedLatest = (await saver.getTuple(config(0))).checkpoint.channel_values.messages;
      expect(storedLatest.map(m => m.id)).toEqual(bounded.messages.map(m => m.id));
      // RemoveMessage changes the latest channel value; it does not delete old
      // snapshots. This reads the actual old PostgreSQL checkpoint by its ID.
      const old = (await saver.getTuple(firstSnapshot.config)).checkpoint.channel_values.messages;
      expect(old.map(m => [m.getType(), m.content, m.id])).toEqual(q1.messages.map(m => [m.getType(), m.content, m.id]));
      await third.invoke({ videoId, question: "Why?" }, config(0));
      expect(retrieve).toHaveBeenLastCalledWith(videoId, "Question 10\nWhy?");
      expect(generate.mock.calls.at(-1)[0].previousQuestion).toBe("Question 10");
      for (const i of [1, 2]) expect((await third.getState(config(i))).values.messages).toHaveLength(2);
      await third.close();
      for (const [i, cancel] of [[3, false], [4, true]]) {
        const seed = fresh();
        await seed.invoke({ videoId, question: "Explain closures." }, config(i));
        const seedIds = (await seed.getState(config(i))).values.messages.map(m => m.id);
        await seed.close();
        for (let n = 1; n <= 6; n += 1) {
          const controller = new AbortController();
          const failing = fresh({ generate: async ({ onToken, signal }) => {
            onToken("unfinished");
            if (cancel) { controller.abort(); signal.throwIfAborted(); }
            throw new Error("Synthetic generation failure");
          } });
          await expect(failing.invoke({ videoId, question: `Failed input ${n}` }, {
            ...config(i), signal: controller.signal, onToken: () => {},
          })).rejects.toThrow();
          await failing.close();
          const inspect = fresh();
          const failed = (await inspect.getState(config(i))).values;
          expect(failed.messages.map(m => m.getType())).toEqual(["human", "ai", "human"]);
          expect(failed.messages.slice(0, 2).map(m => m.id)).toEqual(seedIds);
          expect(failed.messages.at(-1).content).toBe(`Failed input ${n}`);
          expect(failed.status).toBe("pending");
          expect(failed.answer).toBe("");
          await inspect.close();
        }
        const reopened = fresh();
        await reopened.invoke({ videoId, question: "Why?" }, config(i));
        const values = (await reopened.getState(config(i))).values;
        expect(values.messages.map(m => m.getType())).toEqual(["human", "ai", "human", "ai"]);
        expect(values.messages.filter(m => m.getType() === "human").map(m => m.content)).toEqual(["Explain closures.", "Why?"]);
        expect(values.messages.slice(0, 2).map(m => m.id)).toEqual(seedIds);
        expect(values.status).toBe("complete");
        expect(JSON.stringify(values)).not.toMatch(/Failed input|unfinished/);
        expect(retrieve).toHaveBeenLastCalledWith(videoId, "Explain closures.\nWhy?");
        expect(generate.mock.calls.at(-1)[0].previousQuestion).toBe("Explain closures.");
        await reopened.close();
      }
      // The closed resource objects and official saver instances are distinct.
      expect(new Set(resources).size).toBe(resources.length);
      expect(new Set(await Promise.all(resources.map(r => r.ready))).size).toBe(resources.length);
    } catch (error) {
      failure = error;
    } finally {
      const closure = await Promise.allSettled(runtimes.map(r => r.close()));
      const cleanup = createPostgresCheckpointer();
      try {
        const saver = await cleanup.ready;
        for (const id of ids) await saver.deleteThread(id);
      } catch {
        failure = new Error("Scoped integration checkpoint cleanup failed");
      } finally {
        try { await cleanup.close(); } catch { failure = new Error("Integration cleanup pool close failed"); }
      }
      if (closure.some(r => r.status === "rejected")) failure = new Error("Integration runtime cleanup failed");
    }
    if (failure) throw failure;
  }, 60_000,
);
