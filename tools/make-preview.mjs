#!/usr/bin/env node
/**
 * Crea una copia de vista previa sin login y con las preguntas en claro,
 * solo para revisar el diseño en local (no se publica).
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const src = path.join(root, "checkpoint-ccsa");
const dst = path.join(root, "preview-site");

// Copia incremental: el servidor local puede tener el directorio como cwd.
fs.mkdirSync(dst, { recursive: true });
fs.cpSync(src, dst, { recursive: true, force: true });

// index.html sin auth.js, con data.js en claro
let html = fs.readFileSync(path.join(dst, "index.html"), "utf8");
html = html.replace(
  '<script src="assets/js/app.js"></script>\n<script src="assets/js/auth.js"></script>',
  '<script src="assets/js/data.js"></script>\n<script src="assets/js/app.js"></script>'
);
fs.writeFileSync(path.join(dst, "index.html"), html, "utf8");

const content = JSON.parse(fs.readFileSync(path.join(root, "contenido", "preguntas.json"), "utf8"));
const js =
  "window.COURSE=" + JSON.stringify(content.course) + ";\n" +
  "window.MODULES=" + JSON.stringify(content.modules) + ";\n" +
  "window.QUESTIONS=" + JSON.stringify(content.questions) + ";\n";
fs.writeFileSync(path.join(dst, "assets", "js", "data.js"), js, "utf8");

console.log("preview-site listo (sin login, con", content.questions.length, "preguntas)");
