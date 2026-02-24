/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * Stub for @raycast/api — provides runtime values that vitest can resolve.
 * Each test file overrides these with vi.mock("@raycast/api", ...) as needed.
 */

export const Clipboard = {
  copy: async () => {},
  paste: async () => {},
  read: async () => ({ text: "", html: undefined, file: undefined }),
  readText: async () => "",
};

export const Toast = {
  Style: {
    Animated: "animated" as const,
    Failure: "failure" as const,
    Success: "success" as const,
  },
};

export async function showHUD(_message: string) {}
export async function showToast(_options: unknown) {}
export async function showInFinder(_path: string) {}
export async function getSelectedFinderItems(): Promise<{ path: string }[]> {
  return [];
}
export async function getSelectedText(): Promise<string> {
  return "";
}
export async function getFrontmostApplication(): Promise<{
  bundleId: string;
  name: string;
}> {
  return { bundleId: "", name: "" };
}
export function getPreferenceValues<T>(): T {
  return {} as T;
}
