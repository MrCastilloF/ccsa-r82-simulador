#!/usr/bin/env node
/**
 * Une los archivos por módulo (contenido/modulos/*.json) en un solo
 * contenido/preguntas.json, que es lo que cifra build-content.mjs.
 */
import fs from "node:fs";
import path from "node:path";

const root = process.argv[2] || "contenido";
const modsDir = path.join(root, "modulos");
const files = fs.existsSync(modsDir)
  ? fs.readdirSync(modsDir).filter((f) => f.endsWith(".json")).sort((a, b) => {
      const na = parseInt(a.replace(/\D/g, ""), 10);
      const nb = parseInt(b.replace(/\D/g, ""), 10);
      return na - nb;
    })
  : [];

if (!files.length) {
  console.error(`No hay archivos de módulo en ${modsDir}`);
  process.exit(1);
}

const courseFile = path.join(root, "curso.json");
const course = fs.existsSync(courseFile)
  ? JSON.parse(fs.readFileSync(courseFile, "utf8"))
  : { title: "Check Point CCSA R82", passMark: 70 };

const modules = [];
const questions = [];
const seen = new Set();

for (const f of files) {
  const data = JSON.parse(fs.readFileSync(path.join(modsDir, f), "utf8"));
  modules.push(data.module);
  for (const q of data.questions) {
    if (seen.has(q.id)) throw new Error(`ID duplicado: ${q.id} (${f})`);
    seen.add(q.id);
    questions.push(Object.assign({ module: data.module.id }, q));
  }
  console.log(`${f}: ${data.questions.length} preguntas`);
}

const out = { course, modules, questions };
fs.writeFileSync(path.join(root, "preguntas.json"), JSON.stringify(out, null, 1), "utf8");
console.log(`\nTotal: ${questions.length} preguntas, ${modules.length} módulos -> ${path.join(root, "preguntas.json")}`);
