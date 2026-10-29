import assert from "node:assert/strict";
import test from "node:test";
import { createSessionRequest } from "./session-request.js";

test("concurrent consumers share one request and can independently read its body", async () => {
  let calls = 0;
  const session = createSessionRequest(async () => {
    calls++;
    return Response.json({ user: { id: "member" } });
  });
  const responses = await Promise.all(Array.from({ length: 40 }, () => session.get()));
  assert.equal(calls, 1);
  for (const response of responses) assert.equal((await response.json()).user.id, "member");
  await session.get();
  assert.equal(calls, 1);
});

test("guest results are shared; invalidation discards stale in-flight results", async () => {
  let resolve!: (response: Response) => void;
  let calls = 0;
  const session = createSessionRequest(() => {
    calls++;
    return calls === 1 ? new Promise<Response>(done => { resolve = done; }) : Promise.resolve(Response.json({ user: null }, { status: 401 }));
  });
  const stale = session.get();
  session.invalidate();
  assert.equal((await session.get()).status, 401);
  resolve(Response.json({ user: { id: "old-account" } }));
  await stale;
  assert.equal((await session.get()).status, 401);
  assert.equal(calls, 2);
});

test("server failures are not cached and expired sessions are rechecked", async () => {
  let now = 0, calls = 0;
  const session = createSessionRequest(async () => {
    calls++;
    return Response.json({}, { status: calls === 1 ? 503 : 200 });
  }, () => now);
  await session.get(); await session.get(); await session.get();
  assert.equal(calls, 2);
  now = 30_001;
  await session.get();
  assert.equal(calls, 3);
});
