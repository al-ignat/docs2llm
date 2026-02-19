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
} from "./config";
import { promptDefaults, promptTemplateLoop, saveConfig } from "./init";

export async function runConfigWizard(isGlobal: boolean) {
  p.intro("con-the-doc config");

  const globalExists = existsSync(GLOBAL_CONFIG_PATH);
  const localPath = findLocalConfig();
  const config = loadConfig();

  // Show config sources
  const sources: string[] = [];
  if (globalExists) sources.push(`Global: ${GLOBAL_CONFIG_PATH.replace(homedir(), "~")}`);
  if (localPath) sources.push(`Local:  ${localPath}`);
  if (!sources.length) {
    p.log.warn("No config files found. Run con-the-doc init to create one.");
    p.outro("");
    return;
  }
  p.log.info(sources.join("\n"));

  // Show active config summary
  const summary: string[] = [];
  if (config.defaults?.format) summary.push(`Default format: ${config.defaults.format}`);
  if (config.defaults?.outputDir) summary.push(`Output dir: ${config.defaults.outputDir}`);
  summary.push(`Force: ${config.defaults?.force ? "yes" : "no"}`);

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

  // Determine which config to edit
  const targetPath = isGlobal
    ? GLOBAL_CONFIG_PATH
    : localPath ?? LOCAL_CONFIG_NAME;

  const existing = existsSync(targetPath) ? parseConfigFile(targetPath) : {};

  const action = await p.select<string>({
    message: "What would you like to do?",
    options: [
      { value: "add-template" as string, label: "Add a template" },
      { value: "edit-defaults" as string, label: "Edit defaults" },
      { value: "open" as string, label: "Open config file" },
      { value: "done" as string, label: "Done" },
    ],
  });
  if (p.isCancel(action)) { p.cancel("Cancelled."); return; }

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
    if (!templates) { p.outro(""); return; }
    existing.templates = { ...existing.templates, ...templates };
    await saveConfig(targetPath, existing);
    return;
  }

  if (action === "edit-defaults") {
    const defaults = await promptDefaults(existing);
    if (!defaults) { p.outro(""); return; }
    existing.defaults = defaults.defaults;
    if (defaults.pandoc) existing.pandoc = { ...existing.pandoc, ...defaults.pandoc };
    await saveConfig(targetPath, existing);
    return;
  }
}
