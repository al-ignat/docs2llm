#!/usr/bin/env bun

import { mkdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const ROOT = import.meta.dirname ? join(import.meta.dirname, "..") : process.cwd();
const raycastDir = join(ROOT, "raycast");
const buildHome = process.env.DOCS2LLM_RAYCAST_HOME
  ? process.env.DOCS2LLM_RAYCAST_HOME
  : join(tmpdir(), "docs2llm-raycast-home");

mkdirSync(buildHome, { recursive: true });
mkdirSync(join(buildHome, ".config"), { recursive: true });

console.log(`Building Raycast extension with HOME=${buildHome}`);

const proc = Bun.spawn(
  ["npm", "run", "build"],
  {
    cwd: raycastDir,
    stdout: "inherit",
    stderr: "inherit",
    env: {
      ...process.env,
      HOME: buildHome,
      XDG_CONFIG_HOME: join(buildHome, ".config"),
    },
  }
);

const exitCode = await proc.exited;
if (exitCode !== 0) {
  process.exit(exitCode);
}
