import test from "node:test";
import assert from "node:assert/strict";
import { vttPresenceUrl } from "./vtt-origin.js";

test("game presence keeps cookies on loopback or the Docker gateway", () => {
  assert.equal(vttPresenceUrl("http://host.docker.internal:4200").href, "http://host.docker.internal:4200/api/platform/xp-presence");
  assert.equal(vttPresenceUrl("http://localhost:4200").pathname, "/api/platform/xp-presence");
  for (const origin of ["http://example.com", "http://user:pass@localhost:4200", "https://localhost:4200", "http://localhost:4200/?redirect=x", "invalid"]) {
    assert.throws(() => vttPresenceUrl(origin));
  }
});
