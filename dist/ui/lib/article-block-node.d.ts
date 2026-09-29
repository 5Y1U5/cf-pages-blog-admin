import { Node } from "@tiptap/core";
/** 動画の枠から URL を読み取れなかったときに、編集画面にだけ出す案内。 */
export declare const YOUTUBE_UNREADABLE_MESSAGE = "YouTube \u306E URL \u3092\u8AAD\u307F\u53D6\u308C\u307E\u305B\u3093\u3067\u3057\u305F\u3002\u516C\u958B\u30DA\u30FC\u30B8\u306B\u306F\u4F55\u3082\u8868\u793A\u3055\u308C\u307E\u305B\u3093\u3002\u300C\u30DE\u30FC\u30AF\u30C0\u30A6\u30F3\u3067\u7DE8\u96C6\u300D\u3067 URL \u3092\u78BA\u304B\u3081\u3066\u304F\u3060\u3055\u3044";
/** 要素に入っている装飾枠の原文を取り出す。 */
export declare function readArticleBlockSource(element: Element): string;
export declare const ArticleBlock: Node<any, any>;
