import type { ComponentType, ReactNode } from "react";

/**
 * フレームワークごとに異なるルーティング API を吸収するアダプタ。
 * 導入側が1つ実装して各コンポーネントへ渡す。
 */
export interface AdminRouter {
  /** ページ内リンク。href / className / children を受け取れれば実装は何でもよい。 */
  Link: ComponentType<{ href: string; className?: string; children: ReactNode }>;
  /** 画面遷移。履歴を積むかどうかは実装側の判断でよい。 */
  navigate: (href: string) => void;
  /**
   * クエリ文字列の取得。React のフックとして呼ばれるため、実装側もフックの規則を守ること
   * （条件分岐の中で呼ばない、他のフックの後に呼ぶ、など）。
   */
  useSearchParam: (name: string) => string | null;
}
