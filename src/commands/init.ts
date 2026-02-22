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
} from "../core/config";
import type { OutputFormat } from "../core/convert";
import { guard } from "../shared/wizard-utils";

export async function runInit(isGlobal: boolean) {
  const targetPath = isGlobal ? GLOBAL_CONFIG_PATH : LOCAL_CONFIG_NAME;

  p.intro("docs2llm init");

  if (existsSync(targetPath)) {
    const existing = parseConfigFile(targetPath);

    const action = guard(await p.select<string>({
      message: `Config found at ${targetPath}. What would you like to do?`,
      options: [
        { value: "add-template" as string, label: "Add a template" },
        { value: "edit-defaults" as string, label: "Edit defaults" },
        { value: "start-fresh" as string, label: "Start fresh (overwrite)" },
      ],
    }));

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

    // "start-fresh" — fall through to full wizard below
  }

  // Full wizard (new config or start fresh)
  const defaults = await promptDefaults();

  const config: Config = {
    defaults: defaults.defaults,
  };

  const wantTemplate = guard(await p.confirm({
    message: "Create a named template?",
    initialValue: false,
  }));

  if (wantTemplate) {
    const templates = await promptTemplateLoop();
    config.templates = templates;
  }

  await saveConfig(targetPath, config);
}

async function promptDefaults(existing?: Config): Promise<{
  defaults: Config["defaults"];
}> {
  const format = guard(await p.select<OutputFormat>({
    message: "Default output format for Markdown files:",
    initialValue: existing?.defaults?.format,
    options: [
      { value: "docx" as OutputFormat, label: "Word", hint: ".docx" },
      { value: "pptx" as OutputFormat, label: "PowerPoint", hint: ".pptx" },
      { value: "html" as OutputFormat, label: "HTML", hint: ".html" },
    ],
  }));

  const outputDirChoice = guard(await p.select<string>({
    message: "Output directory:",
    options: [
      { value: "same" as string, label: "Same as input file" },
      { value: "custom" as string, label: "Custom path" },
    ],
  }));

  let outputDir: string | undefined;
  if (outputDirChoice === "custom") {
    const dir = guard(await p.text({
      message: "Output directory path:",
      placeholder: existing?.defaults?.outputDir ?? "./out",
    }));
    outputDir = dir;
  }

  const defaults: Config["defaults"] = {
    format,
    ...(outputDir ? { outputDir } : {}),
  };

  return { defaults };
}

async function promptTemplateLoop(
  existing?: Record<string, TemplateConfig>
): Promise<Record<string, TemplateConfig>> {
  const templates: Record<string, TemplateConfig> = {};

  while (true) {
    const tpl = await promptTemplate(existing ? { ...existing, ...templates } : templates);
    templates[tpl.name] = tpl.config;
    p.log.success(`Template "${tpl.name}" added.`);

    const another = await p.confirm({
      message: "Create another template?",
      initialValue: false,
    });
    // Cancel or "no" = stop adding templates
    if (p.isCancel(another) || !another) break;
  }

  return templates;
}

async function promptTemplate(
  existingTemplates?: Record<string, TemplateConfig>
): Promise<{
  name: string;
  config: TemplateConfig;
}> {
  const name = guard(await p.text({
    message: "Template name:",
    placeholder: "report",
    validate: (val) => {
      if (!val?.trim()) return "Name is required.";
      if (/\s/.test(val)) return "No spaces allowed.";
      if (existingTemplates?.[val.trim()]) return `Template "${val.trim()}" already exists.`;
    },
  }));

  const format = guard(await p.select<OutputFormat>({
    message: "Template output format:",
    options: [
      { value: "docx" as OutputFormat, label: "Word", hint: ".docx" },
      { value: "pptx" as OutputFormat, label: "PowerPoint", hint: ".pptx" },
      { value: "html" as OutputFormat, label: "HTML", hint: ".html" },
    ],
  }));

  const desc = guard(await p.text({
    message: "Description (optional):",
    placeholder: "Company report with TOC",
  }));

  const pandocArgs = await promptTemplateFeatures(format);

  return {
    name,
    config: {
      format,
      ...(pandocArgs.length ? { pandocArgs } : {}),
      ...(desc.trim() ? { description: desc.trim() } : {}),
    },
  };
}

async function promptTemplateFeatures(format: OutputFormat): Promise<string[]> {
  type FeatureOption = { value: string; label: string };

  const featureOptions: FeatureOption[] = [];

  if (format === "docx") {
    featureOptions.push(
      { value: "toc", label: "Table of contents" },
      { value: "reference-doc", label: "Use a reference document (company .docx template)" },
    );
  } else if (format === "pptx") {
    featureOptions.push(
      { value: "reference-doc", label: "Use a reference document (company .pptx template)" },
    );
  } else if (format === "html") {
    featureOptions.push(
      { value: "standalone", label: "Standalone HTML (full page with head/body)" },
      { value: "toc", label: "Table of contents" },
      { value: "css", label: "Use a custom CSS stylesheet" },
    );
  }

  const pandocArgs: string[] = [];

  if (featureOptions.length > 0) {
    const features = guard(await p.multiselect({
      message: "What should this template include?",
      options: featureOptions,
      required: false,
    }));

    for (const feat of features) {
      if (feat === "toc") {
        pandocArgs.push("--toc");
      } else if (feat === "standalone") {
        pandocArgs.push("--standalone");
      } else if (feat === "reference-doc") {
        const refPath = guard(await p.text({
          message: "Path to reference document:",
          placeholder: `./template.${format}`,
          validate: (val) => {
            if (!val?.trim()) return "Path is required.";
          },
        }));
        pandocArgs.push(`--reference-doc=${refPath.trim()}`);
      } else if (feat === "css") {
        const cssPath = guard(await p.text({
          message: "Path to CSS stylesheet:",
          placeholder: "./style.css",
          validate: (val) => {
            if (!val?.trim()) return "Path is required.";
          },
        }));
        pandocArgs.push(`--css=${cssPath.trim()}`);
      }
    }
  }

  // Advanced escape hatch
  const wantAdvanced = guard(await p.confirm({
    message: "Advanced: additional Pandoc args?",
    initialValue: false,
  }));

  if (wantAdvanced) {
    const extra = guard(await p.text({
      message: "Pandoc args (space-separated):",
      placeholder: "--shift-heading-level-by=-1",
    }));
    const extraArgs = extra.trim().split(/\s+/).filter(Boolean);
    pandocArgs.push(...extraArgs);
  }

  return pandocArgs;
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
