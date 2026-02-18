import { readdirSync, statSync } from "fs";
import { join, extname, basename } from "path";
import { homedir } from "os";

const CONVERTIBLE_EXTS = new Set([
  ".docx", ".doc", ".pdf", ".pptx", ".ppt",
  ".xlsx", ".xls", ".odt", ".odp", ".ods",
  ".rtf", ".epub", ".mobi", ".eml", ".msg",
  ".csv", ".tsv", ".html", ".xml",
  ".png", ".jpg", ".jpeg", ".tiff", ".bmp", ".gif", ".webp",
  ".md",
]);

export interface FileInfo {
  path: string;
  name: string;
  dir: string;
  modifiedAt: Date;
}

function scanDir(dir: string, maxAge?: number): FileInfo[] {
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    const now = Date.now();
    const files: FileInfo[] = [];

    for (const entry of entries) {
      if (!entry.isFile() || entry.name.startsWith(".")) continue;
      if (!CONVERTIBLE_EXTS.has(extname(entry.name).toLowerCase())) continue;

      const fullPath = join(dir, entry.name);
      try {
        const stat = statSync(fullPath);
        if (maxAge && now - stat.mtimeMs > maxAge) continue;
        files.push({
          path: fullPath,
          name: entry.name,
          dir,
          modifiedAt: stat.mtime,
        });
      } catch {
        // skip files we can't stat
      }
    }

    return files.sort((a, b) => b.modifiedAt.getTime() - a.modifiedAt.getTime());
  } catch {
    return [];
  }
}

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export interface ScanResult {
  cwd: FileInfo[];
  downloads: FileInfo[];
}

export function scanForFiles(): ScanResult {
  const cwdFiles = scanDir(process.cwd(), undefined).slice(0, 5);
  const downloadsDir = join(homedir(), "Downloads");
  const oneDayMs = 24 * 60 * 60 * 1000;
  const dlFiles = scanDir(downloadsDir, oneDayMs).slice(0, 3);

  return { cwd: cwdFiles, downloads: dlFiles };
}

export function formatHint(file: FileInfo): string {
  const relative = file.dir === process.cwd() ? "./" : file.dir.replace(homedir(), "~");
  return `${timeAgo(file.modifiedAt)} · ${relative}`;
}
