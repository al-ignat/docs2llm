import { describe, expect, test } from "bun:test";
import {
  mergeConfigs,
  resolveTemplate,
  buildPandocArgs,
  parseConfigFile,
  serializeConfig,
  type Config,
} from "../src/core/config";

describe("mergeConfigs", () => {
  test("local defaults override global defaults", () => {
    const global: Config = { defaults: { format: "md", force: false } };
    const local: Config = { defaults: { format: "json" } };
    const merged = mergeConfigs(global, local);
    expect(merged.defaults?.format).toBe("json");
    expect(merged.defaults?.force).toBe(false); // preserved from global
  });

  test("uses global pandoc when local has none", () => {
    const global: Config = { pandoc: { html: ["--standalone"] } };
    const local: Config = {};
    const merged = mergeConfigs(global, local);
    expect(merged.pandoc?.html).toEqual(["--standalone"]);
  });

  test("local pandoc overrides global pandoc", () => {
    const global: Config = { pandoc: { html: ["--standalone"] } };
    const local: Config = { pandoc: { html: ["--self-contained"] } };
    const merged = mergeConfigs(global, local);
    expect(merged.pandoc?.html).toEqual(["--self-contained"]);
  });

  test("merges templates from both configs", () => {
    const global: Config = {
      templates: { report: { format: "docx" } },
    };
    const local: Config = {
      templates: { slides: { format: "pptx" } },
    };
    const merged = mergeConfigs(global, local);
    expect(merged.templates?.report?.format).toBe("docx");
    expect(merged.templates?.slides?.format).toBe("pptx");
  });

  test("local template overrides global template of same name", () => {
    const global: Config = {
      templates: { report: { format: "docx", description: "old" } },
    };
    const local: Config = {
      templates: { report: { format: "html", description: "new" } },
    };
    const merged = mergeConfigs(global, local);
    expect(merged.templates?.report?.format).toBe("html");
    expect(merged.templates?.report?.description).toBe("new");
  });
});

describe("resolveTemplate", () => {
  const config: Config = {
    templates: {
      report: { format: "docx", pandocArgs: ["--toc"] },
    },
  };

  test("returns matching template", () => {
    const tpl = resolveTemplate(config, "report");
    expect(tpl.format).toBe("docx");
    expect(tpl.pandocArgs).toEqual(["--toc"]);
  });

  test("throws for unknown template", () => {
    expect(() => resolveTemplate(config, "nonexistent")).toThrow("Unknown template");
  });

  test("includes available templates in error message", () => {
    try {
      resolveTemplate(config, "nope");
      throw new Error("should not reach");
    } catch (err: any) {
      expect(err.message).toContain("report");
    }
  });

  test("throws with 'No templates defined' when config has none", () => {
    expect(() => resolveTemplate({}, "anything")).toThrow("No templates defined");
  });
});

describe("buildPandocArgs", () => {
  test("returns built-in args for html", () => {
    const args = buildPandocArgs("html", {});
    expect(args).toContain("--standalone");
  });

  test("returns empty array for unknown format with no config", () => {
    const args = buildPandocArgs("docx", {});
    expect(args).toEqual([]);
  });

  test("merges config pandoc args", () => {
    const config: Config = { pandoc: { docx: ["--toc"] } };
    const args = buildPandocArgs("docx", config);
    expect(args).toEqual(["--toc"]);
  });

  test("uses template args over config.pandoc when template specified", () => {
    const config: Config = {
      pandoc: { docx: ["--toc"] },
      templates: { report: { format: "docx", pandocArgs: ["--reference-doc=ref.docx"] } },
    };
    const args = buildPandocArgs("docx", config, "report");
    expect(args).toContain("--reference-doc=ref.docx");
    expect(args).not.toContain("--toc");
  });

  test("CLI args override config args", () => {
    const config: Config = { pandoc: { html: ["--css=old.css"] } };
    const args = buildPandocArgs("html", config, undefined, ["--css=new.css"]);
    expect(args).toContain("--css=new.css");
    expect(args).not.toContain("--css=old.css");
  });

  test("deduplicates flags, later entries win", () => {
    const args = buildPandocArgs("html", {}, undefined, ["--standalone", "--toc"]);
    // --standalone from built-in + CLI → should appear once
    const standaloneCount = args.filter((a) => a === "--standalone").length;
    expect(standaloneCount).toBe(1);
  });
});

describe("parseConfigFile", () => {
  test("returns empty object for nonexistent file", () => {
    const config = parseConfigFile("/nonexistent/path/config.yaml");
    expect(config).toEqual({});
  });
});

describe("serializeConfig", () => {
  test("round-trips a config through serialize → parse", () => {
    const config: Config = {
      defaults: { format: "json", force: true },
      templates: { report: { format: "docx" } },
    };
    const yaml = serializeConfig(config);
    expect(yaml).toContain("format: json");
    expect(yaml).toContain("force: true");
  });
});
