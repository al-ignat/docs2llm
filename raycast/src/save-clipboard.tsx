import {
  Action,
  ActionPanel,
  Form,
  showInFinder,
  showToast,
  Toast,
} from "@raycast/api";
import { useEffect, useState } from "react";
import { writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import {
  convertFile,
  convertUrl,
  exportMarkdown,
  getOutputDir,
  isInstalled,
} from "./lib/docs2llm";
import { ClipboardContent, detectClipboard } from "./lib/clipboard-detect";

type Direction = "inbound" | "outbound";

function describeClipboard(clip: ClipboardContent): string {
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

function defaultDirection(clip: ClipboardContent): Direction {
  // HTML, URL, filepath → inbound; text → could be either, default outbound (likely Markdown)
  if (clip.kind === "text") return "outbound";
  return "inbound";
}

function defaultFilename(clip: ClipboardContent): string {
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
  const [clip, setClip] = useState<ClipboardContent | null>(null);
  const [direction, setDirection] = useState<Direction>("inbound");
  const [format, setFormat] = useState("md");
  const [filename, setFilename] = useState("clipboard");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    detectClipboard().then((detected) => {
      setClip(detected);
      setDirection(defaultDirection(detected));
      setFilename(defaultFilename(detected));
      setFormat(defaultDirection(detected) === "inbound" ? "md" : "docx");
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
  }) {
    if (!clip || clip.kind === "empty") {
      await showToast({
        style: Toast.Style.Failure,
        title: "Clipboard is empty",
      });
      return;
    }

    const dir = values.direction as Direction;
    const fmt = values.format;
    const outDir = getOutputDir();
    const outFilename = `${values.filename}.${fmt}`;
    const outPath = join(outDir, outFilename);

    setIsLoading(true);
    await showToast({ style: Toast.Style.Animated, title: "Converting..." });

    try {
      if (dir === "inbound") {
        await handleInbound(clip, fmt, outPath);
      } else {
        await handleOutbound(clip, fmt);
      }
    } catch (err) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Save failed",
        message: String(err),
      });
    } finally {
      setIsLoading(false);
    }
  }

  async function handleInbound(
    clip: ClipboardContent,
    fmt: string,
    outPath: string,
  ) {
    let content: string | undefined;

    if (clip.kind === "url") {
      const result = await convertUrl(clip.url, fmt);
      if (result.error) throw new Error(result.error);
      content = result.content;
    } else if (clip.kind === "filepath") {
      const result = await convertFile(clip.path, fmt);
      if (result.error) throw new Error(result.error);
      content = result.content;
    } else if (clip.kind === "html") {
      // Write HTML to temp, convert
      const tmpPath = join(tmpdir(), `docs2llm-save-${Date.now()}.html`);
      try {
        writeFileSync(tmpPath, clip.html, "utf-8");
        const result = await convertFile(tmpPath, fmt);
        if (result.error) throw new Error(result.error);
        content = result.content;
      } finally {
        try {
          unlinkSync(tmpPath);
        } catch {
          /* ignore */
        }
      }
    } else if (clip.kind === "text") {
      // Save plain text as-is
      content = clip.text;
    }

    if (!content) throw new Error("No content to save");

    writeFileSync(outPath, content, "utf-8");
    await showToast({
      style: Toast.Style.Success,
      title: "Saved",
      message: outPath,
      primaryAction: {
        title: "Reveal in Finder",
        onAction: () => showInFinder(outPath),
      },
    });
  }

  async function handleOutbound(clip: ClipboardContent, fmt: string) {
    // Outbound: text → temp .md → Pandoc → target format
    let mdText: string;
    if (clip.kind === "text") {
      mdText = clip.text;
    } else if (clip.kind === "html" && clip.text) {
      mdText = clip.text;
    } else {
      throw new Error("Outbound export requires Markdown text on clipboard");
    }

    const tmpMd = join(tmpdir(), `docs2llm-save-${Date.now()}.md`);
    try {
      writeFileSync(tmpMd, mdText, "utf-8");
      const result = await exportMarkdown(tmpMd, fmt);
      if (result.error) {
        const isPandocError =
          result.error.toLowerCase().includes("pandoc") ||
          result.error.toLowerCase().includes("not found");
        throw new Error(
          isPandocError ? "Pandoc required: brew install pandoc" : result.error,
        );
      }

      if (result.outputPath) {
        await showToast({
          style: Toast.Style.Success,
          title: "Exported",
          message: result.outputPath,
          primaryAction: {
            title: "Reveal in Finder",
            onAction: () => showInFinder(result.outputPath!),
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

  const showDirectionToggle = clip?.kind === "text";
  const inboundFormats = ["md", "json", "yaml"];
  const outboundFormats = ["docx", "pptx", "html"];
  const formats = direction === "inbound" ? inboundFormats : outboundFormats;

  return (
    <Form
      isLoading={isLoading}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Save" onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      {clip && clip.kind !== "empty" && (
        <Form.Description title="Detected" text={describeClipboard(clip)} />
      )}

      {showDirectionToggle && (
        <Form.Dropdown
          id="direction"
          title="Direction"
          value={direction}
          onChange={(val) => {
            const dir = val as Direction;
            setDirection(dir);
            setFormat(dir === "inbound" ? "md" : "docx");
          }}
        >
          <Form.Dropdown.Item
            value="inbound"
            title="Save as LLM format (inbound)"
          />
          <Form.Dropdown.Item
            value="outbound"
            title="Export via Pandoc (outbound)"
          />
        </Form.Dropdown>
      )}

      {!showDirectionToggle && (
        <Form.Dropdown id="direction" title="Direction" value={direction}>
          <Form.Dropdown.Item
            value="inbound"
            title="Convert to LLM format (inbound)"
          />
        </Form.Dropdown>
      )}

      <Form.Dropdown
        id="format"
        title="Format"
        value={format}
        onChange={setFormat}
      >
        {formats.map((f) => (
          <Form.Dropdown.Item
            key={f}
            value={f}
            title={
              f === "md"
                ? "Markdown"
                : f === "json"
                  ? "JSON"
                  : f === "yaml"
                    ? "YAML"
                    : f === "docx"
                      ? "Word (.docx)"
                      : f === "pptx"
                        ? "PowerPoint (.pptx)"
                        : "HTML (.html)"
            }
          />
        ))}
      </Form.Dropdown>

      <Form.TextField
        id="filename"
        title="Filename"
        value={filename}
        onChange={setFilename}
        info="Without extension — the format determines the extension"
      />
    </Form>
  );
}
