// Prints a new Ed25519 key pair for VTT launch tickets: the private key (base64
// PEM) goes in the API's .env as PLATFORM_LAUNCH_PRIVATE_KEY; the public key is
// what a VTT host adds to its trusted Platform keys. Nothing is written to disk.
import { generateKeyPairSync } from "node:crypto";

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const privatePem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
console.log(`PLATFORM_LAUNCH_PRIVATE_KEY=${Buffer.from(privatePem).toString("base64")}`);
console.log("");
console.log("Public key for the VTT's trusted Platform keys:");
console.log(publicKey.export({ type: "spki", format: "pem" }).toString());
