import test from "node:test";
import assert from "node:assert/strict";
import { resolveVttOrigin } from "./vtt-origin.js";

test("VTT accepts loopback or the explicit Docker host gateway without enabling arbitrary credential forwarding", () => {
  assert.equal(resolveVttOrigin(undefined)?.origin, "http://127.0.0.1:4200");
  assert.equal(resolveVttOrigin("http://host.docker.internal:4200")?.hostname, "host.docker.internal");
  for (const input of ["bad", "http://attacker.example", "http://user:pass@localhost:4200", "https://localhost:4200", "http://localhost:4200/private", "http://localhost:4200/?key=x"]) {
    assert.equal(resolveVttOrigin(input), null, input);
  }
});
