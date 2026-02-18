import { basename, dirname, join, extname } from "path";

export type OutboundFormat = "docx" | "pptx" | "html";

let pandocAvailable: boolean | null = null;

async function checkPandoc(): Promise<boolean> {
  if (pandocAvailable !== null) return pandocAvailable;

  try {
    const proc = Bun.spawn(["pandoc", "--version"], {
      stdout: "ignore",
      stderr: "ignore",
    });
    const code = await proc.exited;
    pandocAvailable = code === 0;
  } catch {
    pandocAvailable = false;
  }

  return pandocAvailable;
}

export async function convertMarkdownTo(
  inputPath: string,
  format: OutboundFormat
): Promise<string> {
  if (!(await checkPandoc())) {
    throw new Error(
      "Pandoc is required for outbound conversion (md → docx/pptx/html).\nInstall: brew install pandoc"
    );
  }

  const name = basename(inputPath, extname(inputPath));
  const dir = dirname(inputPath);
  const outPath = join(dir, `${name}.${format}`);

  const proc = Bun.spawn(["pandoc", inputPath, "-o", outPath], {
    stdout: "pipe",
    stderr: "pipe",
  });

  const code = await proc.exited;

  if (code !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(`Pandoc failed (exit ${code}): ${stderr.trim()}`);
  }

  return outPath;
}
