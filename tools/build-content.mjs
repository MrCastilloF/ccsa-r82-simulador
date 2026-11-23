#!/usr/bin/env node
/**
 * Genera los archivos de contenido protegido para el simulador.
 *
 *   node tools/build-content.mjs --user ccsa --pass "MiClaveSegura" \
 *        --in contenido/preguntas.json --out checkpoint-ccsa
 *
 * Escribe:
 *   assets/data/content.enc.json  (banco de preguntas cifrado AES-256-GCM)
 *   assets/data/auth.json         (sal, iteraciones y huella del usuario)
 *
 * La contraseña NO se guarda en ningún sitio: solo se usa para derivar la clave.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const args = process.argv.slice(2);
const getArg = (name, fallback = null) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const user = getArg("user", "ccsa");
const pass = getArg("pass", "");
const inFile = getArg("in", "contenido/preguntas.json");
const outDir = getArg("out", "checkpoint-ccsa");
const iterations = parseInt(getArg("iterations", "310000"), 10);

if (!pass || pass.length < 8) {
  console.error("ERROR: indica una contraseña de al menos 8 caracteres con --pass.");
  process.exit(1);
}
if (!fs.existsSync(inFile)) {
  console.error(`ERROR: no existe el archivo de contenido ${inFile}`);
  process.exit(1);
}

const raw = fs.readFileSync(inFile, "utf8");
const content = JSON.parse(raw);

// Validación mínima antes de cifrar
const problems = [];
if (!Array.isArray(content.questions) || !content.questions.length) problems.push("No hay preguntas.");
if (!Array.isArray(content.modules) || !content.modules.length) problems.push("No hay módulos.");
const ids = new Set();
(content.questions || []).forEach((q, i) => {
  const where = `Pregunta #${i + 1} (${q.id || "sin id"})`;
  if (!q.id) problems.push(`${where}: falta id.`);
  if (ids.has(q.id)) problems.push(`${where}: id duplicado.`);
  ids.add(q.id);
  if (!q.question || q.question.length < 15) problems.push(`${where}: enunciado demasiado corto.`);
  if (!Array.isArray(q.options) || q.options.length < 2) problems.push(`${where}: opciones insuficientes.`);
  if (!Array.isArray(q.answer) || !q.answer.length) problems.push(`${where}: falta respuesta.`);
  (q.answer || []).forEach((a) => {
    if (a < 0 || a >= (q.options || []).length) problems.push(`${where}: índice de respuesta fuera de rango.`);
  });
  if (!q.module) problems.push(`${where}: falta módulo.`);
  if (!q.explanation) problems.push(`${where}: falta explicación.`);
  if (q.image) {
    const imgPath = path.join(outDir, q.image);
    if (!fs.existsSync(imgPath)) problems.push(`${where}: no existe la imagen ${q.image}`);
  }
});
if (problems.length) {
  console.error("Se encontraron problemas:\n- " + problems.join("\n- "));
  process.exit(1);
}

// Cifrado
const salt = crypto.randomBytes(16);
const iv = crypto.randomBytes(12);
const key = crypto.pbkdf2Sync(pass, salt, iterations, 32, "sha256");
const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
const payload = Buffer.concat([cipher.update(JSON.stringify(content), "utf8"), cipher.final()]);
const tag = cipher.getAuthTag();

const dataDir = path.join(outDir, "assets", "data");
fs.mkdirSync(dataDir, { recursive: true });

fs.writeFileSync(
  path.join(dataDir, "content.enc.json"),
  JSON.stringify({
    v: 1,
    alg: "AES-256-GCM",
    iv: iv.toString("base64"),
    // WebCrypto espera el tag de autenticación al final del ciphertext
    data: Buffer.concat([payload, tag]).toString("base64")
  }),
  "utf8"
);

const userHash = crypto.createHash("sha256").update(user.toLowerCase() + "|" + salt.toString("base64")).digest("hex");
fs.writeFileSync(
  path.join(dataDir, "auth.json"),
  JSON.stringify(
    {
      v: 1,
      kdf: "PBKDF2-SHA256",
      iterations,
      salt: salt.toString("base64"),
      userHash
    },
    null,
    2
  ),
  "utf8"
);

const size = fs.statSync(path.join(dataDir, "content.enc.json")).size;
console.log(`✔ Contenido cifrado: ${content.questions.length} preguntas, ${content.modules.length} módulos (${(size / 1024).toFixed(1)} KB).`);
console.log(`✔ Usuario configurado: ${user}`);
console.log("✔ Credenciales guardadas solo como huella + sal (la contraseña no se almacena).");
