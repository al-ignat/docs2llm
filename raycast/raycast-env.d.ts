/// <reference types="@raycast/api">

/* 🚧 🚧 🚧
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 * 🚧 🚧 🚧 */

/* eslint-disable @typescript-eslint/ban-types */

type ExtensionPreferences = {
  /** Default Format - Default output format for conversions */
  "defaultFormat": "md" | "json" | "yaml",
  /** Binary Path - Custom path to docs2llm binary. Leave empty to auto-detect from PATH. */
  "binaryPath": string,
  /** Enable OCR - Use OCR when converting images and scanned PDFs */
  "enableOcr": boolean,
  /** Output Directory - Directory for saved files and exports. Defaults to ~/Downloads. */
  "outputDir"?: string,
  /** Default Export Format - Default format for outbound exports (Smart Save, Smart Paste to Finder) */
  "defaultExportFormat": "docx" | "pptx" | "html"
}

/** Preferences accessible in all the extension's commands */
declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Preferences accessible in the `convert-file` command */
  export type ConvertFile = ExtensionPreferences & {}
  /** Preferences accessible in the `convert-clipboard` command */
  export type ConvertClipboard = ExtensionPreferences & {}
  /** Preferences accessible in the `convert-url` command */
  export type ConvertUrl = ExtensionPreferences & {}
  /** Preferences accessible in the `quick-convert` command */
  export type QuickConvert = ExtensionPreferences & {}
  /** Preferences accessible in the `export-markdown` command */
  export type ExportMarkdown = ExtensionPreferences & {}
  /** Preferences accessible in the `markdown-to-rich-text` command */
  export type MarkdownToRichText = ExtensionPreferences & {}
  /** Preferences accessible in the `save-clipboard` command */
  export type SaveClipboard = ExtensionPreferences & {}
  /** Preferences accessible in the `copy-as-rich-text` command */
  export type CopyAsRichText = ExtensionPreferences & {}
  /** Preferences accessible in the `smart-copy` command */
  export type SmartCopy = ExtensionPreferences & {}
  /** Preferences accessible in the `smart-paste` command */
  export type SmartPaste = ExtensionPreferences & {}
  /** Preferences accessible in the `smart-save` command */
  export type SmartSave = ExtensionPreferences & {}
}

declare namespace Arguments {
  /** Arguments passed to the `convert-file` command */
  export type ConvertFile = {}
  /** Arguments passed to the `convert-clipboard` command */
  export type ConvertClipboard = {}
  /** Arguments passed to the `convert-url` command */
  export type ConvertUrl = {}
  /** Arguments passed to the `quick-convert` command */
  export type QuickConvert = {}
  /** Arguments passed to the `export-markdown` command */
  export type ExportMarkdown = {}
  /** Arguments passed to the `markdown-to-rich-text` command */
  export type MarkdownToRichText = {}
  /** Arguments passed to the `save-clipboard` command */
  export type SaveClipboard = {}
  /** Arguments passed to the `copy-as-rich-text` command */
  export type CopyAsRichText = {}
  /** Arguments passed to the `smart-copy` command */
  export type SmartCopy = {}
  /** Arguments passed to the `smart-paste` command */
  export type SmartPaste = {}
  /** Arguments passed to the `smart-save` command */
  export type SmartSave = {}
}

