import {
  Action,
  ActionPanel,
  Detail,
  Form,
  getPreferenceValues,
  getSelectedFinderItems,
  open,
  showInFinder,
  showToast,
  Toast,
  useNavigation,
} from "@raycast/api";
import { useEffect, useState } from "react";
import {
  convertFile,
  convertWithTemplate,
  exportMarkdown,
  isInstalled,
  loadTemplates,
} from "./lib/docs2llm";
import { ResultView } from "./lib/result-view";

type Direction = "inbound" | "outbound";

function detectDirection(filePath: string): Direction {
  return filePath.endsWith(".md") || filePath.endsWith(".markdown")
    ? "outbound"
    : "inbound";
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

export default function Command() {
  const { push } = useNavigation();
  const prefs = getPreferenceValues<{
    defaultFormat: string;
    defaultExportFormat: string;
    enableOcr: boolean;
    defaultTemplate: string;
  }>();

  const [filePath, setFilePath] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [direction, setDirection] = useState<Direction>("inbound");
  const [format, setFormat] = useState(prefs.defaultFormat || "md");
  const [isLoading, setIsLoading] = useState(true);
  const [noSelection, setNoSelection] = useState(false);
  const templates = loadTemplates();

  useEffect(() => {
    getSelectedFinderItems()
      .then((items) => {
        if (items.length === 0) {
          setNoSelection(true);
          setIsLoading(false);
          return;
        }
        const path = items[0].path;
        const name = path.split("/").pop() || "file";
        const dir = detectDirection(path);
        setFilePath(path);
        setFileName(name);
        setDirection(dir);
        setFormat(
          dir === "inbound"
            ? prefs.defaultFormat || "md"
            : prefs.defaultExportFormat || "docx",
        );
        setIsLoading(false);
      })
      .catch(() => {
        setNoSelection(true);
        setIsLoading(false);
      });
  }, []);

  if (!isInstalled()) {
    return (
      <Detail markdown="# docs2llm not found\n\nInstall it or set the binary path in extension preferences." />
    );
  }

  if (noSelection) {
    return (
      <Detail
        markdown="# No Finder Selection\n\nSelect a file in Finder first, then run Quick Convert."
        actions={
          <ActionPanel>
            <Action.Open
              title="Open Finder"
              target="file:///Users"
              application="com.apple.finder"
            />
          </ActionPanel>
        }
      />
    );
  }

  async function handleSubmit(values: {
    direction: string;
    format: string;
    ocr: boolean;
    template: string;
  }) {
    if (!filePath) return;

    const dir = values.direction as Direction;
    const fmt = values.format;

    setIsLoading(true);

    try {
      if (dir === "outbound") {
        const useTemplate = values.template && values.template !== "__none__";

        await showToast({
          style: Toast.Style.Animated,
          title: useTemplate
            ? `Exporting ${fileName} with template "${values.template}"...`
            : `Exporting ${fileName} as ${fmt.toUpperCase()}...`,
        });

        const result = useTemplate
          ? await convertWithTemplate(filePath, values.template)
          : await exportMarkdown(filePath, fmt);

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
        await showToast({
          style: Toast.Style.Animated,
          title: `Converting ${fileName}...`,
        });

        const result = await convertFile(filePath, fmt, values.ocr);

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
    } finally {
      setIsLoading(false);
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
      <Form.Description title="File" text={filePath ? `${fileName} — ${filePath}` : "Loading..."} />

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
