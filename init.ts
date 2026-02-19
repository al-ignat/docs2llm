import * as p from "@clack/prompts";
import { existsSync, mkdirSync } from "fs";
import { dirname } from "path";
import {
  type Config,
  type TemplateConfig,
  LOCAL_CONFIG_NAME,
  GLOBAL_CONFIG_PATH,
  parseConfigFile,
  serializeConfig,
} from "./config";
import type { OutputFormat } from "./convert";

export async function runInit(isGlobal: boolean) {
  const targetPath = isGlobal ? GLOBAL_CONFIG_PATH : LOCAL_CONFIG_NAME;

  p.intro("con-the-doc init");

  if (existsSync(targetPath)) {
    const existing = parseConfigFile(targetPath);

    const action = await p.select<string>({
      message: `Config found at ${targetPath}. What would you like to do?`,
      options: [
        { value: "add-template" as string, label: "Add a template" },
        { value: "edit-defaults" as string, label: "Edit defaults" },
        { value: "start-fresh" as string, label: "Start fresh (overwrite)" },
      ],
    });
    if (p.isCancel(action)) { p.cancel("Cancelled."); return; }

    if (action === "add-template") {
      const templates = await promptTemplateLoop(existing.templates);
      if (!templates) return;
      existing.templates = { ...existing.templates, ...templates };
      await saveConfig(targetPath, existing);
      return;
    }

    if (action === "edit-defaults") {
      const defaults = await promptDefaults(existing);
      if (!defaults) return;
      existing.defaults = defaults.defaults;
      if (defaults.pandoc) existing.pandoc = { ...existing.pandoc, ...defaults.pandoc };
      await saveConfig(targetPath, existing);
      return;
    }

    // "start-fresh" — fall through to full wizard below
  }

  // Full wizard (new config or start fresh)
  const defaults = await promptDefaults();
  if (!defaults) return;

  const config: Config = {
    defaults: defaults.defaults,
    ...(defaults.pandoc ? { pandoc: defaults.pandoc } : {}),
  };

  const wantTemplate = await p.confirm({
    message: "Create a named template?",
    initialValue: false,
  });
  if (p.isCancel(wantTemplate)) { p.cancel("Cancelled."); return; }

  if (wantTemplate) {
    const templates = await promptTemplateLoop();
    if (templates) {
      config.templates = templates;
    }
  }

  await saveConfig(targetPath, config);
}

async function promptDefaults(existing?: Config): Promise<{
  defaults: Config["defaults"];
  pandoc?: Config["pandoc"];
} | null> {
  const format = await p.select<OutputFormat>({
    message: "Default output format for Markdown files:",
    initialValue: existing?.defaults?.format,
    options: [
      { value: "docx" as OutputFormat, label: "Word", hint: ".docx" },
      { value: "pptx" as OutputFormat, label: "PowerPoint", hint: ".pptx" },
      { value: "html" as OutputFormat, label: "HTML", hint: ".html" },
    ],
  });
  if (p.isCancel(format)) { p.cancel("Cancelled."); return null; }

  const outputDirChoice = await p.select<string>({
    message: "Output directory:",
    options: [
      { value: "same" as string, label: "Same as input file" },
      { value: "custom" as string, label: "Custom path" },
    ],
  });
  if (p.isCancel(outputDirChoice)) { p.cancel("Cancelled."); return null; }

  let outputDir: string | undefined;
  if (outputDirChoice === "custom") {
    const dir = await p.text({
      message: "Output directory path:",
      placeholder: existing?.defaults?.outputDir ?? "./out",
    });
    if (p.isCancel(dir)) { p.cancel("Cancelled."); return null; }
    outputDir = dir;
  }

  const addToc = await p.confirm({
    message: "Add table of contents by default?",
    initialValue: false,
  });
  if (p.isCancel(addToc)) { p.cancel("Cancelled."); return null; }

  const defaults: Config["defaults"] = {
    format,
    ...(outputDir ? { outputDir } : {}),
  };

  const pandoc = addToc ? { [format]: ["--toc"] } : undefined;

  return { defaults, pandoc };
}

async function promptTemplateLoop(
  existing?: Record<string, TemplateConfig>
): Promise<Record<string, TemplateConfig> | null> {
  const templates: Record<string, TemplateConfig> = {};

  while (true) {
    const tpl = await promptTemplate(existing ? { ...existing, ...templates } : templates);
    if (!tpl) {
      // If user cancelled on first template, return null; otherwise return what we have
      return Object.keys(templates).length > 0 ? templates : null;
    }
    templates[tpl.name] = tpl.config;
    p.log.success(`Template "${tpl.name}" added.`);

    const another = await p.confirm({
      message: "Create another template?",
      initialValue: false,
    });
    if (p.isCancel(another) || !another) break;
  }

  return Object.keys(templates).length > 0 ? templates : null;
}

async function promptTemplate(
  existingTemplates?: Record<string, TemplateConfig>
): Promise<{
  name: string;
  config: TemplateConfig;
} | null> {
  const name = await p.text({
    message: "Template name:",
    placeholder: "report",
    validate: (val) => {
      if (!val.trim()) return "Name is required.";
      if (/\s/.test(val)) return "No spaces allowed.";
      if (existingTemplates?.[val.trim()]) return `Template "${val.trim()}" already exists.`;
    },
  });
  if (p.isCancel(name)) return null;

  const format = await p.select<OutputFormat>({
    message: "Template output format:",
    options: [
      { value: "docx" as OutputFormat, label: "Word", hint: ".docx" },
      { value: "pptx" as OutputFormat, label: "PowerPoint", hint: ".pptx" },
      { value: "html" as OutputFormat, label: "HTML", hint: ".html" },
    ],
  });
  if (p.isCancel(format)) return null;

  const desc = await p.text({
    message: "Description (optional):",
    placeholder: "Company report with TOC",
  });
  if (p.isCancel(desc)) return null;

  const pandocInput = await p.text({
    message: "Pandoc args (space-separated, optional):",
    placeholder: "--toc --reference-doc=./template.docx",
  });
  if (p.isCancel(pandocInput)) return null;

  const pandocArgs = pandocInput
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  return {
    name,
    config: {
      format,
      ...(pandocArgs.length ? { pandocArgs } : {}),
      ...(desc.trim() ? { description: desc.trim() } : {}),
    },
  };
}

async function saveConfig(targetPath: string, config: Config) {
  const yaml = serializeConfig(config);
  p.log.info(`Config to write to ${targetPath}:\n${yaml}`);

  const dir = dirname(targetPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  await Bun.write(targetPath, yaml);

  p.outro(`Config saved to ${targetPath}`);
}

// Re-export for P4 config wizard
export { promptDefaults, promptTemplateLoop, saveConfig };
