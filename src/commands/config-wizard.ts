import * as p from "@clack/prompts";
import { existsSync } from "fs";
import { homedir } from "os";
import {
  type Config,
  LOCAL_CONFIG_NAME,
  GLOBAL_CONFIG_PATH,
  findLocalConfig,
  parseConfigFile,
  loadConfig,
} from "../core/config";
import { promptDefaults, promptTemplateLoop, saveConfig } from "./init";
import { guard } from "../shared/wizard-utils";

async function pickConfigTarget(): Promise<string> {
  const globalExists = existsSync(GLOBAL_CONFIG_PATH);
  const localPath = findLocalConfig();

  // Pre-select: local if it exists, else global if it exists, else local
  const defaultValue = localPath ? "local" : globalExists ? "global" : "local";

  const target = guard(await p.select<string>({
    message: "Which config to edit?",
    initialValue: defaultValue,
    options: [
      { value: "local" as string, label: "Local", hint: LOCAL_CONFIG_NAME },
      { value: "global" as string, label: "Global", hint: GLOBAL_CONFIG_PATH.replace(homedir(), "~") },
    ],
  }));

  return target === "global" ? GLOBAL_CONFIG_PATH : (localPath ?? LOCAL_CONFIG_NAME);
}

export async function runConfigWizard() {
  p.intro("docs2llm config");

  const globalExists = existsSync(GLOBAL_CONFIG_PATH);
  const localPath = findLocalConfig();
  const config = loadConfig();

  // No config found → offer inline creation
  if (!globalExists && !localPath) {
    p.log.warn("No config files found.");

    const create = await p.confirm({
      message: "Create one now?",
      initialValue: true,
    });
    if (p.isCancel(create) || !create) { p.outro(""); return; }

    const targetPath = await pickConfigTarget();
    const defaults = await promptDefaults();

    const newConfig: Config = { defaults: defaults.defaults };

    const wantTemplate = guard(await p.confirm({
      message: "Create a named template?",
      initialValue: false,
    }));

    if (wantTemplate) {
      const templates = await promptTemplateLoop();
      newConfig.templates = templates;
    }

    await saveConfig(targetPath, newConfig);
    return;
  }

  // Show config sources
  const sources: string[] = [];
  if (globalExists) sources.push(`Global: ${GLOBAL_CONFIG_PATH.replace(homedir(), "~")}`);
  if (localPath) sources.push(`Local:  ${localPath}`);
  p.log.info(sources.join("\n"));

  // Show active config summary
  const summary: string[] = [];
  if (config.defaults?.format) summary.push(`Default format: ${config.defaults.format}`);
  if (config.defaults?.outputDir) summary.push(`Output dir: ${config.defaults.outputDir}`);
  summary.push(`Overwrite existing files: ${config.defaults?.force ? "always" : "ask first"}`);

  const templateNames = Object.keys(config.templates ?? {});
  if (templateNames.length > 0) {
    summary.push("");
    summary.push("Templates:");
    for (const name of templateNames) {
      const tpl = config.templates![name];
      const desc = tpl.description ? ` — ${tpl.description}` : "";
      summary.push(`  ${name}${desc} (${tpl.format})`);
    }
  }
  p.log.info(summary.join("\n"));

  // Ask which config to edit
  const targetPath = await pickConfigTarget();

  const existing = existsSync(targetPath) ? parseConfigFile(targetPath) : {};

  const action = guard(await p.select<string>({
    message: "What would you like to do?",
    options: [
      { value: "add-template" as string, label: "Add a template" },
      { value: "edit-defaults" as string, label: "Edit defaults" },
      { value: "open" as string, label: "Open config file" },
      { value: "done" as string, label: "Done" },
    ],
  }));

  if (action === "done") {
    p.outro("");
    return;
  }

  if (action === "open") {
    const path = targetPath.replace(homedir(), "~");
    p.log.info(`Config file: ${targetPath}`);
    p.outro(`Open it with your editor: $EDITOR ${path}`);
    return;
  }

  if (action === "add-template") {
    const templates = await promptTemplateLoop(existing.templates);
    existing.templates = { ...existing.templates, ...templates };
    await saveConfig(targetPath, existing);
    return;
  }

  if (action === "edit-defaults") {
    const defaults = await promptDefaults(existing);
    existing.defaults = defaults.defaults;
    await saveConfig(targetPath, existing);
    return;
  }
}
