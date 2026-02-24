import {
  Action,
  ActionPanel,
  Detail,
  Form,
  getPreferenceValues,
  open,
  showInFinder,
  showToast,
  Toast,
  useNavigation,
} from "@raycast/api";
import { useState } from "react";
import {
  convertFile,
  convertWithTemplate,
  exportMarkdown,
  isInstalled,
  loadTemplates,
} from "./lib/docs2llm";
import { ResultView } from "./lib/result-view";

type Direction = "inbound" | "outbound";

interface FormValues {
  file: string[];
  direction: string;
  format: string;
  ocr: boolean;
  template: string;
}

function detectDirection(filePath: string): Direction {
  return filePath.endsWith(".md") || filePath.endsWith(".markdown")
    ? "outbound"
    : "inbound";
}

export default function Command() {
  const { push } = useNavigation();
  const prefs = getPreferenceValues<{
    defaultFormat: string;
    defaultExportFormat: string;
    enableOcr: boolean;
    defaultTemplate: string;
  }>();
  const [isLoading, setIsLoading] = useState(false);
  const [direction, setDirection] = useState<Direction>("inbound");
  const [format, setFormat] = useState(prefs.defaultFormat || "md");
  const templates = loadTemplates();

  if (!isInstalled()) {
    return (
      <Detail
        markdown={`# docs2llm not found

The \`docs2llm\` binary was not found on your system.

## Install

\`\`\`bash
# Install with bun
bun install -g docs2llm

# Or build from source
git clone https://github.com/al-ignat/docs2llm
cd docs2llm && bun run build
\`\`\`

You can also set a custom binary path in the extension preferences.`}
        actions={
          <ActionPanel>
            <Action.OpenInBrowser
              title="View on GitHub"
              url="https://github.com/al-ignat/docs2llm"
            />
            <Action.Open
              title="Open Extension Preferences"
              target="raycast://extensions/al-ignat/docs2llm"
            />
          </ActionPanel>
        }
      />
    );
  }

  async function handleSubmit(values: FormValues) {
    if (!values.file || values.file.length === 0) {
      await showToast({
        style: Toast.Style.Failure,
        title: "No file selected",
      });
      return;
    }

    const filePath = values.file[0];
    const fileName = filePath.split("/").pop() || "file";
    const dir = values.direction as Direction;

    setIsLoading(true);

    if (dir === "outbound") {
      // Outbound: Markdown → Word/PowerPoint/HTML via Pandoc
      const useTemplate = values.template && values.template !== "__none__";

      await showToast({
        style: Toast.Style.Animated,
        title: useTemplate
          ? `Exporting ${fileName} with template "${values.template}"...`
          : `Exporting ${fileName} as ${values.format.toUpperCase()}...`,
      });

      const result = useTemplate
        ? await convertWithTemplate(filePath, values.template)
        : await exportMarkdown(filePath, values.format);

      setIsLoading(false);

      if (result.error) {
        const isPandocError = result.error.toLowerCase().includes("pandoc");
        await showToast({
          style: Toast.Style.Failure,
          title: isPandocError ? "Pandoc required" : "Export failed",
          message: isPandocError
            ? "Install Pandoc: brew install pandoc"
            : result.error,
        });
        return;
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
          secondaryAction: {
            title: "Open File",
            onAction: () => open(result.outputPath!),
          },
        });
      }
    } else {
      // Inbound: file → Markdown/JSON/YAML
      const result = await convertFile(filePath, values.format, values.ocr);
      setIsLoading(false);

      if (result.error) {
        await showToast({
          style: Toast.Style.Failure,
          title: "Conversion failed",
          message: result.error,
        });
        return;
      }

      push(<ResultView result={result} sourceName={fileName} />);
    }
  }

  function handleFileChange(files: string[]) {
    if (files.length > 0) {
      const newDir = detectDirection(files[0]);
      setDirection(newDir);
      setFormat(
        newDir === "inbound"
          ? prefs.defaultFormat || "md"
          : prefs.defaultExportFormat || "docx",
      );
    }
  }

  const defaultTemplate =
    prefs.defaultTemplate &&
    templates.some((t) => t.name === prefs.defaultTemplate)
      ? prefs.defaultTemplate
      : "__none__";

  const inboundFormats = ["md", "json", "yaml"];
  const outboundFormats = ["docx", "pptx", "html"];
  const formats = direction === "inbound" ? inboundFormats : outboundFormats;

  return (
    <Form
      isLoading={isLoading}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Convert" onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <Form.FilePicker
        id="file"
        title="File"
        allowMultipleSelection={false}
        onChange={handleFileChange}
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
          <Form.Dropdown.Item
            key={f}
            value={f}
            title={formatTitle(f)}
          />
        ))}
      </Form.Dropdown>
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

function formatTitle(f: string): string {
  switch (f) {
    case "md":
      return "Markdown";
    case "json":
      return "JSON";
    case "yaml":
      return "YAML";
    case "docx":
      return "Word (.docx)";
    case "pptx":
      return "PowerPoint (.pptx)";
    case "html":
      return "HTML (.html)";
    default:
      return f;
  }
}
