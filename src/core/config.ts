import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { homedir } from "os";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import type { OutputFormat } from "./convert";

export interface TemplateConfig {
  format: OutputFormat;
  pandocArgs?: string[];
  description?: string;
}

export interface Config {
  defaults?: {
    format?: OutputFormat;
    outputDir?: string;
    force?: boolean;
  };
  pandoc?: Record<string, string[]>;
  templates?: Record<string, TemplateConfig>;
}

export const LOCAL_CONFIG_NAME = ".docs2llm.yaml";
export const GLOBAL_CONFIG_PATH = join(
  homedir(),
  ".config",
  "docs2llm",
  "config.yaml"
);

export function findLocalConfig(startDir?: string): string | null {
  let dir = startDir ?? process.cwd();
  const home = homedir();

  while (true) {
    const candidate = join(dir, LOCAL_CONFIG_NAME);
    if (existsSync(candidate)) return candidate;
    // Stop at home directory to avoid picking up configs from shared parent dirs
    if (dir === home) break;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return null;
}

export function parseConfigFile(path: string): Config {
  if (!existsSync(path)) return {};
  try {
    const raw = readFileSync(path, "utf-8").trim();
    if (!raw) return {};
    return (parseYaml(raw) as Config) ?? {};
  } catch {
    return {};
  }
}

export function mergeConfigs(global: Config, local: Config): Config {
  return {
    defaults: { ...global.defaults, ...local.defaults },
    pandoc: local.pandoc
      ? { ...global.pandoc, ...local.pandoc }
      : global.pandoc,
    templates: { ...global.templates, ...local.templates },
  };
}

export function loadConfig(): Config {
  const global = parseConfigFile(GLOBAL_CONFIG_PATH);
  const localPath = findLocalConfig();
  const local = localPath ? parseConfigFile(localPath) : {};
  return mergeConfigs(global, local);
}

export function resolveTemplate(
  config: Config,
  name: string
): TemplateConfig {
  const tpl = config.templates?.[name];
  if (!tpl) {
    const available = Object.keys(config.templates ?? {});
    const hint = available.length
      ? ` Available: ${available.join(", ")}`
      : " No templates defined.";
    throw new Error(`Unknown template: "${name}".${hint}`);
  }
  return tpl;
}

const BUILTIN_PANDOC_ARGS: Record<string, string[]> = {
  html: ["--standalone"],
};

export function buildPandocArgs(
  format: string,
  config: Config,
  templateName?: string,
  cliArgs?: string[]
): string[] {
  const builtIn = BUILTIN_PANDOC_ARGS[format] ?? [];

  const configArgs = templateName
    ? (config.templates?.[templateName]?.pandocArgs ?? [])
    : (config.pandoc?.[format] ?? []);

  const cli = cliArgs ?? [];

  const merged = [...builtIn, ...configArgs, ...cli];

  // Deduplicate in reverse so later entries win, then reverse back.
  // For --key=value flags, deduplicate by prefix (part before '=').
  // For simple flags (no '='), deduplicate by exact match.
  const seen = new Set<string>();
  const result: string[] = [];

  for (let i = merged.length - 1; i >= 0; i--) {
    const arg = merged[i];
    const eqIdx = arg.indexOf("=");
    const key = eqIdx !== -1 ? arg.slice(0, eqIdx) : arg;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(arg);
  }

  result.reverse();
  return result;
}

export function serializeConfig(config: Config): string {
  return stringifyYaml(config, { lineWidth: 0 });
}
