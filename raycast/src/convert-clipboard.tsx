import {
  Action,
  ActionPanel,
  Form,
  getPreferenceValues,
  open,
  showInFinder,
  showToast,
  Toast,
  useNavigation,
} from "@raycast/api";
import { useEffect, useState } from "react";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import {
  convertFile,
  convertUrl,
  convertWithTemplate,
  exportMarkdown,
  isInstalled,
  loadTemplates,
} from "./lib/docs2llm";
import { ClipboardContent, detectClipboard } from "./lib/clipboard-detect";
import {
  type Direction,
  formatTitle,
  INBOUND_FORMATS,
  OUTBOUND_FORMATS,
} from "./lib/format-utils";
import { ResultView } from "./lib/result-view";

export function describeClipboard(clip: ClipboardContent): string {
  switch (clip.kind) {
    case "html":
      return "HTML from clipboard";
    case "url":
      return `URL: ${clip.url}`;
    case "filepath":
      return `File: ${basename(clip.path)}`;
    case "text":
      return "Text from clipboard";
    case "empty":
      return "Clipboard is empty";
  }
}

export function defaultDirection(clip: ClipboardContent): Direction {
  if (clip.kind === "text") return "outbound";
  if (clip.kind === "filepath") {
    return clip.path.endsWith(".md") || clip.path.endsWith(".markdown")
      ? "outbound"
      : "inbound";
  }
  return "inbound";
}

export function defaultFilename(clip: ClipboardContent): string {
  switch (clip.kind) {
    case "url": {
      try {
        return new URL(clip.url).hostname.replace(/\./g, "-");
      } catch {
        return "url-content";
      }
    }
    case "filepath":
      return basename(clip.path).replace(/\.[^.]+$/, "");
    case "html":
      return "clipboard-html";
    case "text":
      return "clipboard-text";
    default:
      return "clipboard";
  }
}

export default function Command() {
  const { push } = useNavigation();
  const prefs = getPreferenceValues<{
    defaultFormat: string;
    defaultExportFormat: string;
    enableOcr: boolean;
    defaultTemplate: string;
  }>();

  const [clip, setClip] = useState<ClipboardContent | null>(null);
  const [direction, setDirection] = useState<Direction>("inbound");
  const [format, setFormat] = useState(prefs.defaultFormat || "md");
  const [filename, setFilename] = useState("clipboard");
  const [urlField, setUrlField] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const templates = loadTemplates();

  useEffect(() => {
    detectClipboard().then((detected) => {
      setClip(detected);
      const dir = defaultDirection(detected);
      setDirection(dir);
      setFilename(defaultFilename(detected));
      setFormat(
        dir === "inbound"
          ? prefs.defaultFormat || "md"
          : prefs.defaultExportFormat || "docx",
      );
      if (detected.kind === "url") {
        setUrlField(detected.url);
      }
      setIsLoading(false);
    });
  }, []);

  if (!isInstalled()) {
    return (
      <Form>
        <Form.Description text="docs2llm not found. Install it or set the binary path in extension preferences." />
      </Form>
    );
  }

  async function handleSubmit(values: {
    direction: string;
    format: string;
    filename: string;
    url: string;
    ocr: boolean;
    template: string;
  }) {
    if (!clip || clip.kind === "empty") {
      if (!values.url?.trim()) {
        await showToast({
          style: Toast.Style.Failure,
          title: "Nothing to convert",
        });
        return;
      }
    }

    const dir = values.direction as Direction;
    const fmt = values.format;

    setIsLoading(true);
    await showToast({ style: Toast.Style.Animated, title: "Converting..." });

    try {
      // URL field takes priority if filled
      if (values.url?.trim()) {
        const url = values.url.trim();
        const result = await convertUrl(url, fmt);
        if (result.error) throw new Error(result.error);

        let host: string;
        try {
          host = new URL(url).hostname;
        } catch {
          host = "URL";
        }
        push(
          <ResultView result={result} sourceName={host} sourceUrl={url} />,
        );
        return;
      }

      if (dir === "inbound") {
        await handleInbound(clip!, fmt, values.ocr);
      } else {
        await handleOutbound(clip!, fmt, values.template);
      }
    } catch (err) {
      const msg = String(err instanceof Error ? err.message : err);
      const isPandocError = msg.toLowerCase().includes("pandoc");
      await showToast({
        style: Toast.Style.Failure,
        title: isPandocError ? "Pandoc required" : "Conversion failed",
        message: isPandocError ? "brew install pandoc" : msg,
      });
    } finally {
      setIsLoading(false);
    }
  }

  async function handleInbound(
    clip: ClipboardContent,
    fmt: string,
    ocr: boolean,
  ) {
    if (clip.kind === "url") {
      const result = await convertUrl(clip.url, fmt);
      if (result.error) throw new Error(result.error);
      let host: string;
      try {
        host = new URL(clip.url).hostname;
      } catch {
        host = "URL";
      }
      push(
        <ResultView result={result} sourceName={host} sourceUrl={clip.url} />,
      );
      return;
    }

    if (clip.kind === "filepath") {
      const result = await convertFile(clip.path, fmt, ocr);
      if (result.error) throw new Error(result.error);
      push(<ResultView result={result} sourceName={basename(clip.path)} />);
      return;
    }

    if (clip.kind === "html") {
      const tmpPath = join(tmpdir(), `docs2llm-clip-${Date.now()}.html`);
      try {
        writeFileSync(tmpPath, clip.html, "utf-8");
        const result = await convertFile(tmpPath, fmt, ocr);
        if (result.error) throw new Error(result.error);
        push(<ResultView result={result} sourceName="Clipboard HTML" />);
      } finally {
        try {
          unlinkSync(tmpPath);
        } catch {
          /* ignore */
        }
      }
      return;
    }

    if (clip.kind === "text") {
      const words = clip.text.split(/\s+/).filter(Boolean).length;
      push(
        <ResultView
          result={{
            content: clip.text,
            words,
            tokens: Math.ceil(words * 1.33),
          }}
          sourceName="Clipboard Text"
        />,
      );
    }
  }

  async function handleOutbound(
    clip: ClipboardContent,
    fmt: string,
    template: string,
  ) {
    let mdText: string;
    if (clip.kind === "text") {
      mdText = clip.text;
    } else if (clip.kind === "html" && clip.text) {
      mdText = clip.text;
    } else if (clip.kind === "filepath") {
      mdText = readFileSync(clip.path, "utf-8");
    } else {
      throw new Error("Outbound export requires Markdown text on clipboard");
    }

    const useTemplate = template && template !== "__none__";
    const tmpMd = join(tmpdir(), `docs2llm-clip-${Date.now()}.md`);
    try {
      writeFileSync(tmpMd, mdText, "utf-8");

      const result = useTemplate
        ? await convertWithTemplate(tmpMd, template)
        : await exportMarkdown(tmpMd, fmt);

      if (result.error) throw new Error(result.error);

      if (result.outputPath) {
        await showToast({
          style: Toast.Style.Success,
          title: "Exported",
          message: result.outputPath,
          primaryAction: {
            title: "Reveal in Finder",
            onAction: () => showInFinder(result.outputPath!),
          },
          secondaryAction: {
            title: "Open File",
            onAction: () => open(result.outputPath!),
          },
        });
      }
    } finally {
      try {
        unlinkSync(tmpMd);
      } catch {
        /* ignore */
      }
    }
  }

  const defaultTemplate =
    prefs.defaultTemplate &&
    templates.some((t) => t.name === prefs.defaultTemplate)
      ? prefs.defaultTemplate
      : "__none__";

  const formats = direction === "inbound" ? INBOUND_FORMATS : OUTBOUND_FORMATS;

  return (
    <Form
      isLoading={isLoading}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Convert" onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      {clip && clip.kind !== "empty" && (
        <Form.Description title="Detected" text={describeClipboard(clip)} />
      )}

      <Form.TextField
        id="url"
        title="URL"
        placeholder="https://example.com (optional — overrides clipboard)"
        value={urlField}
        onChange={setUrlField}
      />

      <Form.Dropdown
        id="direction"
        title="Direction"
        value={direction}
        onChange={(val) => {
          const dir = val as Direction;
          setDirection(dir);
          setFormat(
            dir === "inbound"
              ? prefs.defaultFormat || "md"
              : prefs.defaultExportFormat || "docx",
          );
        }}
      >
        <Form.Dropdown.Item
          value="inbound"
          title="To LLM format (inbound)"
        />
        <Form.Dropdown.Item
          value="outbound"
          title="Export via Pandoc (outbound)"
        />
      </Form.Dropdown>

      <Form.Dropdown
        id="format"
        title="Format"
        value={format}
        onChange={setFormat}
      >
        {formats.map((f) => (
          <Form.Dropdown.Item key={f} value={f} title={formatTitle(f)} />
        ))}
      </Form.Dropdown>

      <Form.TextField
        id="filename"
        title="Filename"
        value={filename}
        onChange={setFilename}
        info="For save operations — extension is added from format"
      />

      {direction === "inbound" && (
        <Form.Checkbox
          id="ocr"
          label="Enable OCR"
          defaultValue={prefs.enableOcr ?? false}
        />
      )}

      {direction === "outbound" && templates.length > 0 && (
        <Form.Dropdown
          id="template"
          title="Template"
          defaultValue={defaultTemplate}
        >
          <Form.Dropdown.Item value="__none__" title="(None)" />
          {templates.map((t) => (
            <Form.Dropdown.Item
              key={t.name}
              value={t.name}
              title={t.description ? `${t.name} — ${t.description}` : t.name}
            />
          ))}
        </Form.Dropdown>
      )}
    </Form>
  );
}
