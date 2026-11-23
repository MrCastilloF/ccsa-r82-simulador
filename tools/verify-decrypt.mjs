#!/usr/bin/env node
/**
 * Verifica que el contenido cifrado se descifra con las credenciales dadas,
 * replicando exactamente el algoritmo de assets/js/auth.js.
 */
import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";

const site = process.argv[2] || "checkpoint-ccsa";
const user = process.argv[3];
const pass = process.argv[4];

if (!user || !pass) {
  console.error("Uso: node tools/verify-decrypt.mjs <carpeta-del-sitio> <usuario> <contraseña>");
  process.exit(1);
}

const auth = JSON.parse(fs.readFileSync(path.join(site, "assets/data/auth.json"), "utf8"));
const payload = JSON.parse(fs.readFileSync(path.join(site, "assets/data/content.enc.json"), "utf8"));

const salt = Buffer.from(auth.salt, "base64");
const userHash = crypto.createHash("sha256").update(user.toLowerCase() + "|" + auth.salt).digest("hex");
console.log("usuario correcto:", userHash === auth.userHash);

const key = crypto.pbkdf2Sync(pass, salt, auth.iterations, 32, "sha256");
const raw = Buffer.from(payload.data, "base64");
const iv = Buffer.from(payload.iv, "base64");
const tag = raw.subarray(raw.length - 16);
const body = raw.subarray(0, raw.length - 16);

const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
decipher.setAuthTag(tag);
const plain = Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
const content = JSON.parse(plain);

console.log("descifrado OK:", content.questions.length, "preguntas,", content.modules.length, "módulos");
const bad = content.questions.filter((q) => !Array.isArray(q.answer) || !q.answer.length || !q.options || q.options.length < 2);
console.log("preguntas con estructura inválida:", bad.length);
const singles = content.questions.filter((q) => q.type === "single").length;
const multis = content.questions.filter((q) => q.type === "multi").length;
console.log("tipo single:", singles, "| tipo multi:", multis);
