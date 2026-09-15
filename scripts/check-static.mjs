import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";

const root = resolve(process.argv[2] || "dist");
const htmlFiles = [];
const cssFiles = [];

function walk(directory) {
  for (const name of readdirSync(directory)) {
    const path = resolve(directory, name);
    const stats = statSync(path);
    if (stats.isDirectory()) walk(path);
    else if (extname(path).toLowerCase() === ".html") htmlFiles.push(path);
    else if (extname(path).toLowerCase() === ".css") cssFiles.push(path);
  }
}

if (!existsSync(root)) {
  console.error(`Folder build tidak ditemukan: ${root}`);
  process.exit(1);
}

walk(root);

const missing = [];
const attributePattern = /\b(?:href|src)\s*=\s*["']([^"']+)["']/gi;

for (const htmlFile of htmlFiles) {
  const html = readFileSync(htmlFile, "utf8");
  for (const match of html.matchAll(attributePattern)) {
    const value = match[1].trim();
    if (!value || /^(?:[a-z]+:|\/\/|#)/i.test(value)) continue;

    const clean = value.split(/[?#]/, 1)[0];
    if (!clean) continue;

    const target = clean.startsWith("/")
      ? resolve(root, `.${clean}`)
      : resolve(dirname(htmlFile), clean);

    const candidates = [target, resolve(target, "index.html")];
    if (!candidates.some(existsSync)) {
      missing.push(`${htmlFile.slice(root.length + 1)} -> ${value}`);
    }
  }
}

const cssUrlPattern = /url\(\s*["']?([^"')]+)["']?\s*\)/gi;

for (const cssFile of cssFiles) {
  const css = readFileSync(cssFile, "utf8");
  for (const match of css.matchAll(cssUrlPattern)) {
    const value = match[1].trim();
    if (!value || /^(?:[a-z]+:|\/\/|#)/i.test(value)) continue;

    const clean = value.split(/[?#]/, 1)[0];
    const target = resolve(dirname(cssFile), clean);
    if (!existsSync(target)) {
      missing.push(`${cssFile.slice(root.length + 1)} -> ${value}`);
    }
  }
}

if (missing.length) {
  console.error("Referensi file lokal yang tidak ditemukan:");
  missing.forEach(item => console.error(`- ${item}`));
  process.exit(1);
}

console.log(`Validasi static berhasil: ${htmlFiles.length} HTML dan ${cssFiles.length} CSS diperiksa.`);
