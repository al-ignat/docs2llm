export interface ClipboardContent {
  html: string | null;
  text: string | null;
}

export async function readClipboard(): Promise<ClipboardContent> {
  if (process.platform !== "darwin") {
    throw new Error("Clipboard access requires macOS. Pull requests welcome!");
  }

  // Read HTML flavor via Swift (pbpaste only gives plain text)
  const htmlProc = Bun.spawn(
    [
      "swift",
      "-e",
      'import AppKit; if let html = NSPasteboard.general.string(forType: .html) { print(html) }',
    ],
    { stdout: "pipe", stderr: "pipe" }
  );
  const htmlOut = await new Response(htmlProc.stdout).text();
  await htmlProc.exited;
  const html = htmlOut.trim() || null;

  // Read plain text via pbpaste
  const textProc = Bun.spawn(["pbpaste"], { stdout: "pipe", stderr: "pipe" });
  const textOut = await new Response(textProc.stdout).text();
  await textProc.exited;
  const text = textOut || null;

  return { html, text };
}

export async function writeClipboard(text: string): Promise<void> {
  if (process.platform !== "darwin") {
    throw new Error("Clipboard access requires macOS. Pull requests welcome!");
  }

  const proc = Bun.spawn(["pbcopy"], { stdin: "pipe" });
  proc.stdin.write(text);
  proc.stdin.end();
  await proc.exited;
}
