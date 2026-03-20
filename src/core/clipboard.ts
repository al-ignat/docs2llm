export interface ClipboardContent {
  html: string | null;
  text: string | null;
}

export async function readClipboard(): Promise<ClipboardContent> {
  if (process.platform === "darwin") {
    return readClipboardMac();
  }
  if (process.platform === "win32") {
    return readClipboardWindows();
  }
  return readClipboardLinux();
}

export async function writeClipboard(text: string): Promise<void> {
  if (process.platform === "darwin") {
    return writeClipboardMac(text);
  }
  if (process.platform === "win32") {
    return writeClipboardWindows(text);
  }
  return writeClipboardLinux(text);
}

/**
 * Write both HTML and plain-text flavors to the clipboard.
 * This lets rich text editors (Outlook, Google Docs) paste formatted content.
 */
export async function writeClipboardHtml(html: string, plaintext: string): Promise<void> {
  if (process.platform === "darwin") {
    return writeClipboardHtmlMac(html, plaintext);
  }
  if (process.platform === "linux") {
    return writeClipboardHtmlLinux(html, plaintext);
  }
  // Windows / fallback: plain text only
  return writeClipboard(plaintext);
}

// --- macOS ---

async function readClipboardMac(): Promise<ClipboardContent> {
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

async function writeClipboardMac(text: string): Promise<void> {
  const proc = Bun.spawn(["pbcopy"], { stdin: "pipe" });
  proc.stdin.write(text);
  proc.stdin.end();
  await proc.exited;
}

async function writeClipboardHtmlMac(html: string, plaintext: string): Promise<void> {
  // Use Swift to set both HTML and plain text flavors on NSPasteboard.
  // The string is passed via stdin to avoid shell escaping issues.
  const swift = `
import AppKit
import Foundation
let data = FileHandle.standardInput.readDataToEndOfFile()
let json = try! JSONSerialization.jsonObject(with: data) as! [String: String]
let pb = NSPasteboard.general
pb.clearContents()
pb.setString(json["html"]!, forType: .html)
pb.setString(json["text"]!, forType: .string)
`;
  const proc = Bun.spawn(["swift", "-e", swift], {
    stdin: "pipe", stdout: "pipe", stderr: "pipe",
  });
  proc.stdin.write(JSON.stringify({ html, text: plaintext }));
  proc.stdin.end();

  const code = await proc.exited;
  if (code !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(`Failed to write HTML to clipboard: ${stderr.trim()}`);
  }
}

// --- Linux ---

async function findLinuxClipCmd(): Promise<string> {
  // Try xclip first, then xsel
  for (const cmd of ["xclip", "xsel"]) {
    try {
      const proc = Bun.spawn(["which", cmd], { stdout: "pipe", stderr: "pipe" });
      await proc.exited;
      if (proc.exitCode === 0) return cmd;
    } catch {}
  }
  throw new Error(
    "No clipboard tool found.\n" +
    "  Install one: sudo apt install xclip   or   sudo apt install xsel"
  );
}

async function readClipboardLinux(): Promise<ClipboardContent> {
  const cmd = await findLinuxClipCmd();

  let html: string | null = null;
  let text: string | null = null;

  // Read plain text
  const textArgs = cmd === "xclip"
    ? ["xclip", "-selection", "clipboard", "-o"]
    : ["xsel", "--clipboard", "--output"];
  try {
    const proc = Bun.spawn(textArgs, { stdout: "pipe", stderr: "pipe" });
    const out = await new Response(proc.stdout).text();
    await proc.exited;
    if (proc.exitCode === 0) text = out || null;
  } catch {}

  // Try HTML target (xclip only)
  if (cmd === "xclip") {
    try {
      const proc = Bun.spawn(
        ["xclip", "-selection", "clipboard", "-o", "-t", "text/html"],
        { stdout: "pipe", stderr: "pipe" }
      );
      const out = await new Response(proc.stdout).text();
      await proc.exited;
      if (proc.exitCode === 0) html = out.trim() || null;
    } catch {}
  }

  return { html, text };
}

async function writeClipboardLinux(text: string): Promise<void> {
  const cmd = await findLinuxClipCmd();

  const args = cmd === "xclip"
    ? ["xclip", "-selection", "clipboard"]
    : ["xsel", "--clipboard", "--input"];

  const proc = Bun.spawn(args, { stdin: "pipe" });
  proc.stdin.write(text);
  proc.stdin.end();
  await proc.exited;
}

async function writeClipboardHtmlLinux(html: string, plaintext: string): Promise<void> {
  const cmd = await findLinuxClipCmd();

  if (cmd === "xclip") {
    // xclip supports setting specific MIME types
    const htmlProc = Bun.spawn(
      ["xclip", "-selection", "clipboard", "-t", "text/html"],
      { stdin: "pipe" }
    );
    htmlProc.stdin.write(html);
    htmlProc.stdin.end();
    await htmlProc.exited;
  } else {
    // xsel doesn't support MIME types — fall back to plain text
    await writeClipboardLinux(plaintext);
  }
}

// --- Windows ---

async function readClipboardWindows(): Promise<ClipboardContent> {
  const proc = Bun.spawn(
    ["powershell", "-NoProfile", "-Command", "Get-Clipboard"],
    { stdout: "pipe", stderr: "pipe" }
  );
  const out = await new Response(proc.stdout).text();
  await proc.exited;
  return { html: null, text: out || null };
}

async function writeClipboardWindows(text: string): Promise<void> {
  const proc = Bun.spawn(
    ["powershell", "-NoProfile", "-Command", "Set-Clipboard -Value $input"],
    { stdin: "pipe", stdout: "pipe", stderr: "pipe" }
  );
  proc.stdin.write(text);
  proc.stdin.end();
  await proc.exited;
}
