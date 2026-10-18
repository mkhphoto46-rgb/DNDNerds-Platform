import assert from "node:assert/strict";
import {
  decryptPeerId, encryptPeerId, fingerprintPeerId, hashPairToken, newPairToken,
  secureCompare, verifiedTelegramPrivateStart,
} from "../notifications/connection-security.js";

const previousKey = process.env.NOTIFICATION_DESTINATION_KEY_HEX;
try {
  process.env.NOTIFICATION_DESTINATION_KEY_HEX = "a1".repeat(32);
  const token = newPairToken();
  assert.equal(token.length, 43);
  assert.equal(hashPairToken(token).length, 64);
  assert.notEqual(hashPairToken(token), token);
  assert.notEqual(newPairToken(), token);
  assert.equal(secureCompare("a".repeat(32), "a".repeat(32)), true);
  assert.equal(secureCompare("b".repeat(32), "a".repeat(32)), false);
  assert.equal(secureCompare("", ""), false);
  const first = encryptPeerId("123456789");
  const second = encryptPeerId("123456789");
  assert.notEqual(first, second);
  assert.equal(first.includes("123456789"), false);
  assert.equal(decryptPeerId(first), "123456789");
  assert.equal(fingerprintPeerId("TELEGRAM", "123456789").length, 64);
  assert.notEqual(fingerprintPeerId("TELEGRAM", "123456789"), fingerprintPeerId("BALE", "123456789"));
  assert.throws(() => encryptPeerId("-123"));
  assert.throws(() => hashPairToken("invalid"));
  const ok = verifiedTelegramPrivateStart({ message: { chat: { id: 12345, type: "private" }, from: { id: 12345, is_bot: false }, text: `/start ${token}` } });
  assert.deepEqual(ok, { token, peerId: "12345" });
  assert.equal(verifiedTelegramPrivateStart({ message: { chat: { id: 12345, type: "group" }, from: { id: 12345 }, text: `/start ${token}` } }), null);
  assert.equal(verifiedTelegramPrivateStart({ message: { chat: { id: 12345, type: "private" }, from: { id: 999 }, text: `/start ${token}` } }), null);
  assert.equal(verifiedTelegramPrivateStart({ message: { chat: { id: 12345, type: "private" }, from: { id: 12345 }, text: "/start bad" } }), null);
  const parts = first.split(":");
  parts[1] = (parts[1]!.startsWith("a") ? "b" : "a") + parts[1]!.slice(1);
  const tampered = parts.join(":");
  assert.throws(() => decryptPeerId(tampered));
} finally {
  if (previousKey === undefined) delete process.env.NOTIFICATION_DESTINATION_KEY_HEX;
  else process.env.NOTIFICATION_DESTINATION_KEY_HEX = previousKey;
}
console.log("J2O-B1 CONNECTION CRYPTO/PAIRING POLICY SELF-TEST PASS; EXTERNAL DELIVERY DISABLED");
