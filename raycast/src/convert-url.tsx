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
import { convertUrl, isInstalled } from "./lib/docs2llm";

interface FormValues {
  url: string;
  format: string;
}

export default function Command() {
  const { push } = useNavigation();
  const prefs = getPreferenceValues<{ defaultFormat: string }>();
  const [isLoading, setIsLoading] = useState(false);

  if (!isInstalled()) {
    return (
      <Detail
        markdown="# docs2llm not found\n\nInstall `docs2llm` or set the binary path in extension preferences."
        actions={
          <ActionPanel>
            <Action.OpenInBrowser
              title="View on GitHub"
              url="https://github.com/al-ignat/docs2llm"
            />
          </ActionPanel>
        }
      />
    );
  }

  async function handleSubmit(values: FormValues) {
    const url = values.url.trim();
    if (!url) {
      await showToast({ style: Toast.Style.Failure, title: "No URL provided" });
      return;
    }

    setIsLoading(true);
    await showToast({
      style: Toast.Style.Animated,
      title: "Fetching and converting...",
    });
    const result = await convertUrl(url, values.format);
    setIsLoading(false);

    if (result.error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Conversion failed",
        message: result.error,
      });
      return;
    }

    await showToast({ style: Toast.Style.Success, title: "Done" });
    push(<ResultView content={result.content} url={url} />);
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
      <Form.TextField
        id="url"
        title="URL"
        placeholder="https://example.com/page"
      />
      <Form.Dropdown
        id="format"
        title="Format"
        defaultValue={prefs.defaultFormat || "md"}
      >
        <Form.Dropdown.Item value="md" title="Markdown" />
        <Form.Dropdown.Item value="json" title="JSON" />
        <Form.Dropdown.Item value="yaml" title="YAML" />
      </Form.Dropdown>
    </Form>
  );
}

function ResultView({ content, url }: { content: string; url: string }) {
  return (
    <Detail
      markdown={content}
      navigationTitle={`Converted: ${url}`}
      actions={
        <ActionPanel>
          <Action.CopyToClipboard title="Copy to Clipboard" content={content} />
          <Action.Paste title="Paste to Frontmost App" content={content} />
          <Action.OpenInBrowser title="Open Original URL" url={url} />
        </ActionPanel>
      }
    />
  );
}
