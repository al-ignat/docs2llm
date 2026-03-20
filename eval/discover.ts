import { readdir, stat } from "fs/promises";
import { join, basename, extname } from "path";
import { parse } from "yaml";
import { DOCUMENT_CLASSES, type DocumentClass, type Fixture, type FixtureMeta } from "./types";

const knownClasses = new Set<string>(DOCUMENT_CLASSES);

/**
 * Scan eval/fixtures/ subdirectories and discover test fixtures.
 *
 * Each subdirectory name maps to a DocumentClass. Non-hidden files
 * that aren't .meta.yaml sidecars are treated as fixtures.
 * Sibling {basename}.meta.yaml files are loaded as optional metadata.
 */
export async function discoverFixtures(fixturesDir: string): Promise<Fixture[]> {
  const fixtures: Fixture[] = [];

  let subdirs: string[];
  try {
    subdirs = await readdir(fixturesDir);
  } catch {
    return fixtures;
  }

  for (const dir of subdirs.sort()) {
    const dirPath = join(fixturesDir, dir);
    // Check if it's a directory
    const dirStat = await stat(dirPath).catch(() => null);
    if (!dirStat?.isDirectory()) continue;

    if (!knownClasses.has(dir)) {
      console.warn(`[eval] Warning: unknown class directory "${dir}", processing anyway`);
    }

    const documentClass = dir as DocumentClass;
    const files = await readdir(dirPath);

    for (const file of files.sort()) {
      // Skip hidden files, .gitkeep, and .meta.yaml sidecars
      if (file.startsWith(".")) continue;
      if (file.endsWith(".meta.yaml")) continue;

      const filePath = join(dirPath, file);
      const fileStat = await stat(filePath).catch(() => null);
      if (!fileStat?.isFile()) continue;

      // Look for sidecar metadata
      const base = basename(file, extname(file));
      const metaFileName = `${base}.meta.yaml`;
      const metaPath = join(dirPath, metaFileName);
      let meta: FixtureMeta = {};

      if (files.includes(metaFileName)) {
        try {
          const raw = await Bun.file(metaPath).text();
          meta = (parse(raw) as FixtureMeta) ?? {};
        } catch (err) {
          console.warn(`[eval] Warning: failed to parse ${metaPath}: ${err}`);
        }
      }

      // Skip if meta says so
      if (meta.skip) continue;

      fixtures.push({
        filePath,
        fileName: file,
        documentClass,
        meta,
        metaPath: files.includes(metaFileName) ? metaPath : null,
      });
    }
  }

  return fixtures;
}
