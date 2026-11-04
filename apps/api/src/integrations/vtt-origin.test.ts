import test from "node:test";
import assert from "node:assert/strict";
import { inviteBridgeError, resolveVttOrigin, vttConfigWarnings } from "./vtt-origin.js";

test("VTT accepts loopback or the explicit Docker host gateway without enabling arbitrary credential forwarding", () => {
  assert.equal(resolveVttOrigin(undefined)?.origin, "http://127.0.0.1:4200");
  assert.equal(resolveVttOrigin("http://host.docker.internal:4200")?.hostname, "host.docker.internal");
  for (const input of ["bad", "http://attacker.example", "http://user:pass@localhost:4200", "https://localhost:4200", "http://localhost:4200/private", "http://localhost:4200/?key=x"]) {
    assert.equal(resolveVttOrigin(input), null, input);
  }
});

test("B72: a startup warning names VTT_INTERNAL_URL when only the public address is set", () => {
  const [warning] = vttConfigWarnings({ VTT_PUBLIC_URL: "https://play.example.test" });
  assert.match(warning ?? "", /VTT_INTERNAL_URL/);
  assert.deepEqual(vttConfigWarnings({ VTT_PUBLIC_URL: "https://play.example.test", VTT_INTERNAL_URL: "http://127.0.0.1:4200" }), []);
  assert.deepEqual(vttConfigWarnings({}), []);
  assert.match(vttConfigWarnings({ VTT_PUBLIC_URL: "https://play.example.test", VTT_INTERNAL_URL: "https://play.example.test" })[0] ?? "", /VTT_INTERNAL_URL/, "a public address is refused as the bridge");
});

test("B72: an unreachable bridge without VTT_INTERNAL_URL gets its own error code", () => {
  assert.equal(inviteBridgeError(503, {})?.code, "VTT_INTERNAL_URL_MISSING");
  assert.match(inviteBridgeError(503, {})?.message ?? "", /[؀-ۿ]/);
  assert.equal(inviteBridgeError(503, { VTT_INTERNAL_URL: "http://127.0.0.1:4200" }), null);
  assert.equal(inviteBridgeError(404, {}), null);
});
