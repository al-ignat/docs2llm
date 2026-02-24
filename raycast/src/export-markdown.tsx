import {
  Action,
  ActionPanel,
  Form,
  showInFinder,
  showToast,
  Toast,
} from "@raycast/api";
import { useState } from "react";
import {
  convertWithTemplate,
  exportMarkdown,
  getOutputDir,
  isInstalled,
  loadTemplates,
} from "./lib/docs2llm";

interface FormValues {
  file: string[];
  format: string;
  template: string;
  outputDir: string;
}

export default function Command() {
  const [isLoading, setIsLoading] = useState(false);
  const templates = loadTemplates();

  if (!isInstalled()) {
    return (
      <Form>
        <Form.Description text="docs2llm not found. Install it or set the binary path in extension preferences." />
      </Form>
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

    setIsLoading(true);

    let result: { outputPath?: string; error?: string };

    if (values.template && values.template !== "__none__") {
      await showToast({
        style: Toast.Style.Animated,
        title: `Exporting ${fileName} with template "${values.template}"...`,
      });
      result = await convertWithTemplate(filePath, values.template);
    } else {
      await showToast({
        style: Toast.Style.Animated,
        title: `Exporting ${fileName} as ${values.format.toUpperCase()}...`,
      });
      result = await exportMarkdown(filePath, values.format);
    }

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
      });
    }
  }

  return (
    <Form
      isLoading={isLoading}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Export" onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <Form.FilePicker
        id="file"
        title="Markdown File"
        allowMultipleSelection={false}
      />
      <Form.Dropdown id="format" title="Export Format" defaultValue="docx">
        <Form.Dropdown.Item value="docx" title="Word (.docx)" />
        <Form.Dropdown.Item value="pptx" title="PowerPoint (.pptx)" />
        <Form.Dropdown.Item value="html" title="HTML (.html)" />
      </Form.Dropdown>
      {templates.length > 0 && (
        <Form.Dropdown id="template" title="Template" defaultValue="__none__">
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
      <Form.TextField
        id="outputDir"
        title="Output Directory"
        defaultValue={getOutputDir()}
        info="Where to save the exported file"
      />
    </Form>
  );
}
