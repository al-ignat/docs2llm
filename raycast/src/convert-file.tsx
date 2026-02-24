import {
  Action,
  ActionPanel,
  Detail,
  Form,
  getPreferenceValues,
  showToast,
  Toast,
  useNavigation,
} from "@raycast/api";
import { useState } from "react";
import { convertFile, isInstalled } from "./lib/docs2llm";
import { ResultView } from "./lib/result-view";

interface FormValues {
  file: string[];
  format: string;
  ocr: boolean;
}

export default function Command() {
  const { push } = useNavigation();
  const prefs = getPreferenceValues<{
    defaultFormat: string;
    enableOcr: boolean;
  }>();
  const [isLoading, setIsLoading] = useState(false);

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

    setIsLoading(true);
    const filePath = values.file[0];
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

    const fileName = filePath.split("/").pop() || "file";
    push(<ResultView result={result} sourceName={fileName} />);
  }

  return (
    <Form
      isLoading={isLoading}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Convert" onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <Form.FilePicker id="file" title="File" allowMultipleSelection={false} />
      <Form.Dropdown
        id="format"
        title="Format"
        defaultValue={prefs.defaultFormat || "md"}
      >
        <Form.Dropdown.Item value="md" title="Markdown" />
        <Form.Dropdown.Item value="json" title="JSON" />
        <Form.Dropdown.Item value="yaml" title="YAML" />
      </Form.Dropdown>
      <Form.Checkbox
        id="ocr"
        label="Enable OCR"
        defaultValue={prefs.enableOcr ?? false}
      />
    </Form>
  );
}
