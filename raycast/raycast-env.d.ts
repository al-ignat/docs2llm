/// <reference types="@raycast/api">

/* 🚧 🚧 🚧
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 * 🚧 🚧 🚧 */

/* eslint-disable @typescript-eslint/ban-types */

type ExtensionPreferences = {
  /** Binary Path - Custom path to docs2llm binary. Leave empty to auto-detect from PATH. */
  "binaryPath": string,
  /** Pandoc Path - Custom path to Pandoc binary. Leave empty to auto-detect from PATH. */
  "pandocPath": string,
  /** Enable OCR - Use OCR when converting images and scanned PDFs */
  "enableOcr": boolean,
  /** Output Directory - Directory for saved files and exports (required) */
  "outputDir": string,
  /** Default Template - Default template name for outbound conversions. Must match a template in ~/.config/docs2llm/config.yaml. */
  "defaultTemplate": string
}

/** Preferences accessible in all the extension's commands */
declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Preferences accessible in the `convert-file` command */
  export type ConvertFile = ExtensionPreferences & {
  /** Default Inbound Format - Default format when converting files to LLM-friendly output */
  "defaultFormat": "md" | "json" | "yaml",
  /** Default Export Format - Default format when exporting Markdown via Pandoc */
  "defaultExportFormat": "docx" | "pptx" | "html"
}
  /** Preferences accessible in the `convert-clipboard` command */
  export type ConvertClipboard = ExtensionPreferences & {
  /** Default Inbound Format - Default format when converting clipboard to LLM-friendly output */
  "defaultFormat": "md" | "json" | "yaml",
  /** Default Export Format - Default format when exporting Markdown via Pandoc */
  "defaultExportFormat": "docx" | "pptx" | "html"
}
  /** Preferences accessible in the `quick-convert` command */
  export type QuickConvert = ExtensionPreferences & {
  /** Default Inbound Format - Default format when converting files to LLM-friendly output */
  "defaultFormat": "md" | "json" | "yaml",
  /** Default Export Format - Default format when exporting Markdown via Pandoc */
  "defaultExportFormat": "docx" | "pptx" | "html"
}
  /** Preferences accessible in the `smart-copy` command */
  export type SmartCopy = ExtensionPreferences & {
  /** Default Inbound Format - Default format for inbound conversions */
  "defaultFormat": "md" | "json" | "yaml",
  /** Default Export Format - Default format for outbound exports */
  "defaultExportFormat": "docx" | "pptx" | "html"
}
  /** Preferences accessible in the `smart-paste` command */
  export type SmartPaste = ExtensionPreferences & {
  /** Default Inbound Format - Default format for inbound conversions */
  "defaultFormat": "md" | "json" | "yaml",
  /** Default Export Format - Default format for outbound exports */
  "defaultExportFormat": "docx" | "pptx" | "html"
}
  /** Preferences accessible in the `smart-save` command */
  export type SmartSave = ExtensionPreferences & {
  /** Default Inbound Format - Default format for inbound conversions */
  "defaultFormat": "md" | "json" | "yaml",
  /** Default Export Format - Default format for outbound exports */
  "defaultExportFormat": "docx" | "pptx" | "html"
}
}

declare namespace Arguments {
  /** Arguments passed to the `convert-file` command */
  export type ConvertFile = {}
  /** Arguments passed to the `convert-clipboard` command */
  export type ConvertClipboard = {}
  /** Arguments passed to the `quick-convert` command */
  export type QuickConvert = {}
  /** Arguments passed to the `smart-copy` command */
  export type SmartCopy = {}
  /** Arguments passed to the `smart-paste` command */
  export type SmartPaste = {}
  /** Arguments passed to the `smart-save` command */
  export type SmartSave = {}
}

