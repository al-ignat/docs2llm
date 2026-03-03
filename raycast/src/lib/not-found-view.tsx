import { Action, ActionPanel, Detail } from "@raycast/api";

/**
 * Shared Detail view shown when docs2llm binary is not found.
 * Includes install instructions and action links.
 */
export function NotInstalledView() {
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
