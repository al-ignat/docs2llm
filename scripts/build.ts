#!/usr/bin/env bun

/**
 * Build script: compiles docs2llm into a standalone binary via `bun build --compile`.
 * Copies the platform-specific libpdfium next to the binary so Kreuzberg can dlopen it.
 */

import { readFileSync, copyFileSync, existsSync, statSync } from "fs";
import { join, dirname } from "path";

const ROOT = dirname(import.meta.dirname);

// Read version from package.json
const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf-8"));
const version: string = pkg.version;

console.log(`Building docs2llm v${version}…`);

// Determine platform-specific libpdfium details
const PLATFORM_MAP: Record<string, { pkg: string; lib: string }> = {
  "darwin-arm64": { pkg: "@kreuzberg/node-darwin-arm64", lib: "libpdfium.dylib" },
  "darwin-x64":   { pkg: "@kreuzberg/node-darwin-x64",   lib: "libpdfium.dylib" },
  "linux-x64":    { pkg: "@kreuzberg/node-linux-x64-gnu", lib: "libpdfium.so" },
  "linux-arm64":  { pkg: "@kreuzberg/node-linux-arm64-gnu", lib: "libpdfium.so" },
  "win32-x64":    { pkg: "@kreuzberg/node-win32-x64-msvc", lib: "pdfium.dll" },
};

const platformKey = `${process.platform}-${process.arch}`;
const outfile = join(ROOT, "docs2llm");

// Run bun build --compile
const buildArgs = [
  "bun", "build", "--compile",
  join(ROOT, "src/commands/cli.ts"),
  "--outfile", outfile,
  `--define`, `__VERSION__="${version}"`,
];

console.log(`$ ${buildArgs.join(" ")}`);
const build = Bun.spawnSync(buildArgs, { cwd: ROOT, stdout: "inherit", stderr: "inherit" });

if (build.exitCode !== 0) {
  console.error(`Build failed with exit code ${build.exitCode}`);
  process.exit(1);
}

// Copy libpdfium next to the binary
const platInfo = PLATFORM_MAP[platformKey];
if (platInfo) {
  const libSrc = join(ROOT, "node_modules", platInfo.pkg, platInfo.lib);
  const libDst = join(dirname(outfile), platInfo.lib);
  if (existsSync(libSrc)) {
    copyFileSync(libSrc, libDst);
    console.log(`Copied ${platInfo.lib} → ${libDst}`);
  } else {
    console.warn(`⚠ ${platInfo.lib} not found at ${libSrc} — PDF extraction may not work in compiled binary`);
  }
} else {
  console.warn(`⚠ Unknown platform ${platformKey} — skipping libpdfium copy`);
}

// Report results
const stat = statSync(outfile);
const sizeMB = (stat.size / (1024 * 1024)).toFixed(1);
console.log(`\n✓ Built: ${outfile} (${sizeMB} MB)`);
