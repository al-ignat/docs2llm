import {
  Action,
  ActionPanel,
  Color,
  Detail,
  showInFinder,
  showToast,
  Toast,
} from "@raycast/api";
import { ConvertResult, saveToFile } from "./docs2llm";
import { extractErrorMessage } from "./errors";

interface ResultViewProps {
  result: ConvertResult;
  /** Display name of the source (filename or URL). */
  sourceName: string;
  /** If the source is a URL, show "Open Original URL" action. */
  sourceUrl?: string;
  /** If set, show "Open in Editor" action for the saved file. */
  savedFilePath?: string;
}

function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}

export function ResultView({
  result,
  sourceName,
  sourceUrl,
  savedFilePath,
}: ResultViewProps) {
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
        message: extractErrorMessage(err),
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
          {result.engine && (
            <Detail.Metadata.Label title="Engine" text={result.engine} />
          )}
          {result.qualityScore != null && result.qualityScore < 0.7 && (
            <Detail.Metadata.TagList title="Quality">
              <Detail.Metadata.TagList.Item
                text={result.qualityScore < 0.3 ? "Low" : "Fair"}
                color={result.qualityScore < 0.3 ? Color.Red : Color.Orange}
              />
            </Detail.Metadata.TagList>
          )}
          {result.ocrUsed && (
            <Detail.Metadata.Label title="OCR" text="Used" />
          )}
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
          {savedFilePath && (
            <Action.Open
              title="Open in Editor"
              target={savedFilePath}
              shortcut={{ modifiers: ["cmd"], key: "o" }}
            />
          )}
          {sourceUrl && (
            <Action.OpenInBrowser title="Open Original URL" url={sourceUrl} />
          )}
        </ActionPanel>
      }
    />
  );
}
