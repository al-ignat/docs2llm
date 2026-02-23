import { resolve } from "path";
import { existsSync } from "fs";
import { createInterface } from "readline";
import { convertFile, formatOutput, looksLikeScannedPdf, isImageFile, isTesseractError, TESSERACT_INSTALL_HINT, type OutputFormat, type OcrOptions } from "../core/convert";
import { writeOutput } from "../core/output";
import { buildPlan, ValidationError } from "../core/validate";
import { buildPandocArgs, type Config } from "../core/config";
import { getTokenStats, formatTokenStats } from "../core/tokens";
import { fetchAndConvert } from "./fetch";

function confirm(prompt: string): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === "y");
    });
  });
}

// Output mode flags (set via setOutputMode)
let quietMode = false;
let jsonMode = false;

export function setOutputMode(quiet: boolean, json: boolean) {
  quietMode = quiet;
  jsonMode = json;
}

function cliLog(msg: string) {
  if (!quietMode && !jsonMode) console.log(msg);
}
function cliWarn(msg: string) {
  if (!quietMode && !jsonMode) console.log(msg);
}
export function cliError(msg: string) {
  if (!jsonMode) console.error(msg);
}
function cliResult(msg: string) {
  if (!jsonMode) console.log(msg);
}

interface ConversionResult {
  success: boolean;
  input: string;
  output?: string;
  format: string;
  tokens?: number;
  duration_ms: number;
  ocr_used?: boolean;
  error?: string;
}

export async function convertSingleFile(
  filePath: string,
  format: OutputFormat,
  outputDir?: string,
  formatExplicit?: boolean,
  force?: boolean,
  cliPandocArgs?: string[],
  config?: Config,
  templateName?: string | null,
  ocr?: OcrOptions,
  useStdout?: boolean,
  chunks?: boolean,
  chunkSize?: number | null,
) {
  const t0 = performance.now();
  let plan;
  try {
    plan = buildPlan(filePath, format, {
      outputDir,
      formatExplicit,
      defaultMdFormat: config?.defaults?.format,
    });
  } catch (err: any) {
    if (err instanceof ValidationError) {
      if (jsonMode) {
        const result: ConversionResult = { success: false, input: filePath, format, duration_ms: Math.round(performance.now() - t0), error: err.message };
        process.stdout.write(JSON.stringify(result));
        process.exit(1);
      }
      cliError(`✗ ${err.message}`);
      if (err.message.includes("Outbound formats")) {
        cliError("  Tip: only .md files can be converted to docx/pptx/html.");
      }
      process.exit(1);
    }
    throw err;
  }

  // Resolve pandoc args through config for outbound
  if (plan.direction === "outbound" && config) {
    plan.pandocArgs = buildPandocArgs(
      plan.format, config, templateName ?? undefined, cliPandocArgs
    );
    if (!plan.pandocArgs.length) plan.pandocArgs = undefined;
  } else if (cliPandocArgs?.length && plan.direction === "inbound") {
    cliWarn(`⚠ Pandoc args ignored for inbound conversion (${filePath})`);
  }

  if (!useStdout && !force && existsSync(plan.outputPath)) {
    const ok = await confirm(`Output file already exists: ${plan.outputPath}\nOverwrite? [y/N] `);
    if (!ok) process.exit(0);
  }

  try {
    if (plan.direction === "outbound") {
      const result = await convertFile(filePath, plan.format, {
        outputDir,
        pandocArgs: plan.pandocArgs,
      });
      if (jsonMode) {
        const jsonResult: ConversionResult = { success: true, input: filePath, output: result.outputPath, format: plan.format, duration_ms: Math.round(performance.now() - t0) };
        process.stdout.write(JSON.stringify(jsonResult));
      } else {
        cliResult(`✓ ${filePath} → ${result.outputPath}`);
      }
    } else {
      // Auto-enable OCR for images (no text layer to extract)
      let effectiveOcr = ocr;
      let autoOcrFailed = false;
      if (!ocr?.enabled && isImageFile(filePath)) {
        try {
          effectiveOcr = { enabled: true, force: true };
          if (!useStdout) cliLog("⚠ Image detected. Running OCR…");
        } catch { /* effectiveOcr already set */ }
      }

      let result: Awaited<ReturnType<typeof convertFile>>;
      let usedOcr = !!effectiveOcr?.enabled;

      if (effectiveOcr !== ocr) {
        try {
          result = await convertFile(filePath, plan.format, { ocr: effectiveOcr });
        } catch (ocrErr: any) {
          if (isTesseractError(ocrErr)) {
            cliWarn("⚠ OCR unavailable (Tesseract not installed). Converting without OCR…");
            result = await convertFile(filePath, plan.format, { ocr: ocr });
            usedOcr = false;
            autoOcrFailed = true;
          } else {
            throw ocrErr;
          }
        }
      } else {
        result = await convertFile(filePath, plan.format, { ocr: effectiveOcr });
      }

      // Auto-detect scanned PDFs
      if (!autoOcrFailed && !effectiveOcr?.enabled && looksLikeScannedPdf(filePath, result.content)) {
        try {
          if (!useStdout) cliLog("⚠ This looks like a scanned document. Retrying with OCR…");
          result = await convertFile(filePath, plan.format, { ocr: { enabled: true, force: true } });
          usedOcr = true;
        } catch (ocrErr: any) {
          if (isTesseractError(ocrErr)) {
            cliWarn("⚠ OCR unavailable (Tesseract not installed). Keeping non-OCR result.");
          } else {
            throw ocrErr;
          }
        }
      }

      // --chunks mode: split and output as JSON
      if (chunks) {
        const { splitToFit } = await import("../core/tokens");
        const targetSize = chunkSize || 4000;
        const splitResult = splitToFit(result.content, targetSize);
        const output = splitResult.parts.map((text, i) => ({
          index: i,
          content: text,
          tokens: splitResult.tokensPerPart[i],
        }));

        if (useStdout) {
          process.stdout.write(JSON.stringify(output, null, 2));
        } else {
          await writeOutput(plan.outputPath, JSON.stringify(output, null, 2));
          cliResult(`✓ ${filePath} → ${plan.outputPath} (${splitResult.parts.length} chunks)`);
        }
        return;
      }

      // --stdout mode: write to stdout
      if (useStdout) {
        process.stdout.write(result.formatted);
        return;
      }

      await writeOutput(plan.outputPath, result.formatted);
      const stats = getTokenStats(result.content);

      if (jsonMode) {
        const jsonResult: ConversionResult = { success: true, input: filePath, output: plan.outputPath, format: plan.format, tokens: stats.tokens, duration_ms: Math.round(performance.now() - t0), ocr_used: usedOcr || undefined };
        process.stdout.write(JSON.stringify(jsonResult));
      } else {
        cliResult(`✓ ${filePath} → ${plan.outputPath} (${formatTokenStats(stats)})`);
      }

      // Quality warning
      if (result.qualityScore != null && result.qualityScore < 0.5) {
        cliWarn("⚠ Some text may not have been extracted correctly. Check the output.");
      }
    }
  } catch (err: any) {
    const msg = err.message ?? String(err);
    if (jsonMode) {
      const jsonResult: ConversionResult = { success: false, input: filePath, format: plan.format, duration_ms: Math.round(performance.now() - t0), error: msg };
      process.stdout.write(JSON.stringify(jsonResult));
      process.exit(1);
    }
    cliError(`✗ ${filePath}: ${msg}`);
    if (isTesseractError(err)) {
      cliError(`  ${TESSERACT_INSTALL_HINT.replace(/\n/g, "\n  ")}`);
    } else if (msg.includes("Pandoc")) {
      cliError("  Tip: install Pandoc — brew install pandoc (macOS), sudo apt install pandoc (Ubuntu)");
      cliError("  Note: inbound conversion (documents → text) works without Pandoc.");
    }
    if (msg.includes("Unsupported") || msg.includes("format")) {
      cliError("  Tip: run docs2llm formats to see what's supported.");
    }
    process.exit(1);
  }
}

export async function convertFolder(
  dir: string,
  format: OutputFormat,
  outputDir?: string,
  formatExplicit?: boolean,
  force?: boolean,
  cliPandocArgs?: string[],
  config?: Config,
  templateName?: string | null,
  ocr?: OcrOptions
) {
  const t0 = performance.now();
  const { readdirSync } = await import("fs");
  const { join, basename } = await import("path");

  const files = readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && !e.name.startsWith("."))
    .map((e) => join(dir, e.name));

  if (files.length === 0) {
    cliLog("No files found.");
    return;
  }

  if (cliPandocArgs?.length) {
    const hasInbound = files.some((f) => {
      try {
        return buildPlan(f, format, {
          outputDir,
          formatExplicit,
          defaultMdFormat: config?.defaults?.format,
        }).direction === "inbound";
      } catch { return false; }
    });
    if (hasInbound) {
      cliWarn("⚠ Pandoc args ignored for inbound conversions.");
    }
  }

  if (!force) {
    const overwrites: string[] = [];
    for (const file of files) {
      try {
        const plan = buildPlan(file, format, {
          outputDir,
          formatExplicit,
          defaultMdFormat: config?.defaults?.format,
        });
        if (existsSync(plan.outputPath)) {
          overwrites.push(basename(plan.outputPath));
        }
      } catch { /* skip */ }
    }
    if (overwrites.length > 0) {
      cliLog(`${overwrites.length} file(s) would be overwritten:\n  ${overwrites.join(", ")}`);
      const ok = await confirm("Continue? [y/N] ");
      if (!ok) process.exit(0);
    }
  }

  // Build plans for all files first
  interface FilePlan {
    file: string;
    plan: ReturnType<typeof buildPlan>;
  }
  const filePlans: FilePlan[] = [];
  let skipped = 0;

  for (const file of files) {
    try {
      const plan = buildPlan(file, format, {
        outputDir,
        formatExplicit,
        defaultMdFormat: config?.defaults?.format,
      });

      // Resolve pandoc args for outbound
      if (plan.direction === "outbound" && config) {
        plan.pandocArgs = buildPandocArgs(
          plan.format, config, templateName ?? undefined, cliPandocArgs
        );
        if (!plan.pandocArgs.length) plan.pandocArgs = undefined;
      }

      filePlans.push({ file, plan });
    } catch (err: any) {
      if (err instanceof ValidationError) {
        cliLog(`⊘ ${file}: ${err.message}`);
        skipped++;
      } else {
        throw err;
      }
    }
  }

  // Process files in parallel batches (concurrency = 4)
  const BATCH_SIZE = 4;
  let ok = 0;
  let fail = 0;
  const jsonResults: ConversionResult[] = [];

  for (let i = 0; i < filePlans.length; i += BATCH_SIZE) {
    const batch = filePlans.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(async ({ file, plan }) => {
        const ft0 = performance.now();
        if (plan.direction === "outbound") {
          const result = await convertFile(file, plan.format, {
            outputDir,
            pandocArgs: plan.pandocArgs,
          });
          cliResult(`✓ ${file} → ${result.outputPath}`);
          if (jsonMode) jsonResults.push({ success: true, input: file, output: result.outputPath, format: plan.format, duration_ms: Math.round(performance.now() - ft0) });
        } else {
          const isImg = !ocr?.enabled && isImageFile(file);
          const batchOcr = isImg ? { enabled: true, force: true } : ocr;
          let result: Awaited<ReturnType<typeof convertFile>>;
          let usedOcr = !!batchOcr?.enabled;

          if (isImg) {
            try {
              result = await convertFile(file, plan.format, { ocr: batchOcr });
            } catch (ocrErr: any) {
              if (isTesseractError(ocrErr)) {
                cliWarn(`⚠ ${file}: OCR unavailable, converting without OCR`);
                result = await convertFile(file, plan.format, { ocr: ocr });
                usedOcr = false;
              } else {
                throw ocrErr;
              }
            }
          } else {
            result = await convertFile(file, plan.format, { ocr: batchOcr });
          }

          if (!usedOcr && !isImg && looksLikeScannedPdf(file, result.content)) {
            try {
              cliLog(`⚠ ${file}: scanned document detected, retrying with OCR…`);
              result = await convertFile(file, plan.format, { ocr: { enabled: true, force: true } });
              usedOcr = true;
            } catch (ocrErr: any) {
              if (isTesseractError(ocrErr)) {
                cliWarn(`⚠ ${file}: OCR unavailable, keeping non-OCR result`);
              } else {
                throw ocrErr;
              }
            }
          }
          await writeOutput(plan.outputPath, result.formatted);
          const stats = getTokenStats(result.content);
          cliResult(`✓ ${file} → ${plan.outputPath} (${formatTokenStats(stats)})`);
          if (result.qualityScore != null && result.qualityScore < 0.5) {
            cliWarn(`  ⚠ Low quality extraction. Check the output.`);
          }
          if (jsonMode) jsonResults.push({ success: true, input: file, output: plan.outputPath, format: plan.format, tokens: stats.tokens, duration_ms: Math.round(performance.now() - ft0), ocr_used: usedOcr || undefined });
        }
      })
    );

    for (let j = 0; j < results.length; j++) {
      if (results[j].status === "fulfilled") {
        ok++;
      } else {
        const reason = (results[j] as PromiseRejectedResult).reason;
        cliError(`✗ ${batch[j].file}: ${reason?.message ?? reason}`);
        fail++;
        if (jsonMode) jsonResults.push({ success: false, input: batch[j].file, format, duration_ms: 0, error: reason?.message ?? String(reason) });
      }
    }
  }

  if (jsonMode) {
    process.stdout.write(JSON.stringify({ results: jsonResults, total: filePlans.length + skipped, succeeded: ok, failed: fail, duration_ms: Math.round(performance.now() - t0) }));
  } else {
    const parts = [`${ok} converted`, `${fail} failed`];
    if (skipped > 0) parts.push(`${skipped} skipped`);
    cliLog(`\nDone: ${parts.join(", ")}.`);
  }
}

export async function convertUrl(url: string, format: OutputFormat, outputDir?: string, force?: boolean, useStdout?: boolean) {
  const { basename: pathBasename } = await import("path");

  try {
    if (!useStdout) cliLog(`Fetching ${url}…`);
    const result = await fetchAndConvert(url);
    const formatted = formatOutput(result.content, url, "text/html", {}, format);

    if (useStdout) {
      process.stdout.write(formatted);
      return;
    }

    // Derive a filename from the URL
    let urlPath = new URL(url).pathname.replace(/\/$/, "");
    let name = pathBasename(urlPath) || "page";
    name = name.replace(/\.[^.]+$/, "");
    const ext = format === "json" ? ".json" : format === "yaml" ? ".yaml" : ".md";
    const outName = `${name}${ext}`;
    const outPath = outputDir ? resolve(outputDir, outName) : resolve(outName);

    if (!force && existsSync(outPath)) {
      const ok = await confirm(`Output file already exists: ${outPath}\nOverwrite? [y/N] `);
      if (!ok) process.exit(0);
    }

    await writeOutput(outPath, formatted);
    const stats = getTokenStats(result.content);
    cliResult(`✓ ${url} → ${outPath} (${formatTokenStats(stats)})`);
  } catch (err: any) {
    cliError(
      `✗ Failed to fetch '${url}'.\n` +
      `  ${err.message ?? err}\n` +
      `  Tip: check the URL is correct and accessible.`
    );
    process.exit(1);
  }
}

const MAX_STDIN_BYTES = 100 * 1024 * 1024; // 100 MB

export async function convertStdin(
  format: OutputFormat,
  useStdout: boolean,
  outputDir?: string,
  force?: boolean,
  ocr?: OcrOptions,
  chunks?: boolean,
  chunkSize?: number | null,
) {
  const { convertBytes } = await import("../core/convert");

  // Read all of stdin as bytes with size limit
  const inputChunks: Uint8Array[] = [];
  let totalLength = 0;
  for await (const chunk of Bun.stdin.stream()) {
    totalLength += chunk.length;
    if (totalLength > MAX_STDIN_BYTES) {
      cliError(`✗ stdin input exceeds ${MAX_STDIN_BYTES / (1024 * 1024)} MB size limit.`);
      process.exit(1);
    }
    inputChunks.push(chunk);
  }
  const data = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of inputChunks) {
    data.set(chunk, offset);
    offset += chunk.length;
  }

  if (data.length === 0) {
    cliError("✗ No data received on stdin.");
    process.exit(1);
  }

  try {
    // Auto-detect MIME type from magic bytes
    const mime = detectMimeFromBytes(data);
    const result = await convertBytes(data, mime, ocr);

    const content = result.content;
    const formatted = formatOutput(content, "stdin", mime, {}, format);

    if (chunks) {
      const { splitToFit } = await import("../core/tokens");
      const targetSize = chunkSize || 4000;
      const splitResult = splitToFit(content, targetSize);
      const output = splitResult.parts.map((text, i) => ({
        index: i,
        content: text,
        tokens: splitResult.tokensPerPart[i],
      }));
      process.stdout.write(JSON.stringify(output, null, 2));
      return;
    }

    if (useStdout) {
      process.stdout.write(formatted);
      return;
    }

    // Write to file
    const ext = format === "json" ? ".json" : format === "yaml" ? ".yaml" : ".md";
    const outPath = outputDir ? resolve(outputDir, `stdin-output${ext}`) : resolve(`stdin-output${ext}`);
    if (!force && existsSync(outPath)) {
      const ok = await confirm(`Output file already exists: ${outPath}\nOverwrite? [y/N] `);
      if (!ok) process.exit(0);
    }
    await writeOutput(outPath, formatted);
    const stats = getTokenStats(content);
    cliResult(`✓ stdin → ${outPath} (${formatTokenStats(stats)})`);
  } catch (err: any) {
    cliError(`✗ stdin: ${err.message ?? err}`);
    if (isTesseractError(err)) {
      cliError(`  ${TESSERACT_INSTALL_HINT.replace(/\n/g, "\n  ")}`);
    }
    process.exit(1);
  }
}

function detectMimeFromBytes(data: Uint8Array): string {
  // PDF: %PDF
  if (data[0] === 0x25 && data[1] === 0x50 && data[2] === 0x44 && data[3] === 0x46) {
    return "application/pdf";
  }
  // ZIP-based (docx, pptx, xlsx, epub, odt): PK\x03\x04
  if (data[0] === 0x50 && data[1] === 0x4b && data[2] === 0x03 && data[3] === 0x04) {
    // Scan ZIP local file headers for characteristic paths to identify the format
    const text = new TextDecoder("ascii", { fatal: false }).decode(data.subarray(0, Math.min(data.length, 8192)));
    if (text.includes("word/document.xml")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    if (text.includes("ppt/presentation.xml")) return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    if (text.includes("xl/workbook.xml")) return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    if (text.includes("META-INF/container.xml")) return "application/epub+zip";
    if (text.includes("mimetype")) return "application/zip"; // ODF — let Kreuzberg refine
    return "application/zip";
  }
  // PNG
  if (data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) {
    return "image/png";
  }
  // JPEG
  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
    return "image/jpeg";
  }
  // GIF
  if (data[0] === 0x47 && data[1] === 0x49 && data[2] === 0x46) {
    return "image/gif";
  }
  // Try as text/HTML
  const head = new TextDecoder().decode(data.slice(0, 256)).trim();
  if (head.startsWith("<!") || head.startsWith("<html") || head.startsWith("<HTML")) {
    return "text/html";
  }
  // Default to plain text
  return "text/plain";
}
