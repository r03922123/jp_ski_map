// A self-signed certificate for `pnpm dev:https`, so a phone on the same Wi-Fi gets a
// secure context (browsers only share GPS with https pages). Nothing is installed into
// the system trust store: the phone shows a warning once and you accept it.
// Regenerated when it is missing, older than its 30 days, or lacks this Mac's LAN address.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, statSync } from "node:fs";
import { networkInterfaces } from "node:os";

const DIR = ".certs";
const KEY = `${DIR}/dev-key.pem`;
const CERT = `${DIR}/dev-cert.pem`;
const DAYS = 30;

const lanIps = Object.values(networkInterfaces())
  .flat()
  .filter((i) => i && i.family === "IPv4" && !i.internal)
  .map((i) => i.address);
const san = [
  "DNS:localhost",
  "IP:127.0.0.1",
  ...lanIps.map((ip) => `IP:${ip}`),
].join(",");

function current() {
  if (!existsSync(KEY) || !existsSync(CERT)) return false;
  const ageDays = (Date.now() - statSync(CERT).mtimeMs) / 86_400_000;
  if (ageDays > DAYS - 1) return false;
  const text = execFileSync(
    "openssl",
    ["x509", "-in", CERT, "-noout", "-ext", "subjectAltName"],
    {
      encoding: "utf8",
    },
  );
  return lanIps.every((ip) => text.includes(ip));
}

if (!current()) {
  mkdirSync(DIR, { recursive: true });
  execFileSync(
    "openssl",
    [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-days",
      String(DAYS),
      "-subj",
      "/CN=hakuba-ski-map-dev",
      "-addext",
      `subjectAltName=${san}`,
      "-keyout",
      KEY,
      "-out",
      CERT,
    ],
    { stdio: "ignore" },
  );
}
for (const ip of lanIps)
  console.log(`  On your phone (same Wi-Fi): https://${ip}:3443`);
