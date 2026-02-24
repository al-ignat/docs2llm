import {
  Action,
  ActionPanel,
  Detail,
  showInFinder,
  showToast,
  Toast,
} from "@raycast/api";
import { ConvertResult, saveToFile } from "./docs2llm";

interface ResultViewProps {
  result: ConvertResult;
  /** Display name of the source (filename or URL). */
  sourceName: string;
  /** If the source is a URL, show "Open Original URL" action. */
  sourceUrl?: string;
}

function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}

export function ResultView({ result, sourceName, sourceUrl }: ResultViewProps) {
  async function handleSave() {
    const ext = "md";
    const baseName = sourceName.replace(/\.[^.]+$/, "");
    const filename = `${baseName}.${ext}`;

    try {
      const outPath = saveToFile(result.content, filename);
      await showToast({
        style: Toast.Style.Success,
        title: "Saved",
        message: outPath,
        primaryAction: {
          title: "Reveal in Finder",
          onAction: () => showInFinder(outPath),
        },
      });
    } catch (err) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Save failed",
        message: String(err),
      });
    }
  }

  return (
    <Detail
      markdown={result.content}
      navigationTitle={`Converted: ${sourceName}`}
      metadata={
        <Detail.Metadata>
          <Detail.Metadata.Label title="Source" text={sourceName} />
          <Detail.Metadata.Separator />
          <Detail.Metadata.Label
            title="Words"
            text={formatNumber(result.words)}
          />
          <Detail.Metadata.Label
            title="Tokens (approx)"
            text={`~${formatNumber(result.tokens)}`}
          />
        </Detail.Metadata>
      }
      actions={
        <ActionPanel>
          <Action.CopyToClipboard
            title="Copy to Clipboard"
            content={result.content}
          />
          <Action.Paste
            title="Paste to Frontmost App"
            content={result.content}
          />
          <Action
            title="Save to File"
            onAction={handleSave}
            shortcut={{ modifiers: ["cmd"], key: "s" }}
          />
          <Action.CopyToClipboard
            title="Copy as Code Block"
            content={`\`\`\`\n${result.content}\n\`\`\``}
            shortcut={{ modifiers: ["cmd", "shift"], key: "c" }}
          />
          {sourceUrl && (
            <Action.OpenInBrowser title="Open Original URL" url={sourceUrl} />
          )}
        </ActionPanel>
      }
    />
  );
}
