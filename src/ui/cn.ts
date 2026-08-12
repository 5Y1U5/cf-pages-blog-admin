import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * クラス名の結合。
 * 導入先アプリのユーティリティに依存しないよう、パッケージ内に持つ。
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
