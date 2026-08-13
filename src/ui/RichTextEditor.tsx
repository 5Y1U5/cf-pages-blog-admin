"use client";

// マークダウン記法を覚えなくても記事を書けるようにするためのリッチエディタ。
// 表示は HTML だが、親コンポーネントへ渡す値はマークダウンのまま。
// 記事の保存形式と公開の流れは変わらない。

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import {
  Bold,
  Heading2,
  Heading3,
  ImagePlus,
  Italic,
  Link2,
  Link2Off,
  List,
  ListOrdered,
  Minus,
  Quote,
  Redo2,
  Undo2,
} from "lucide-react";

import {
  htmlToMarkdown,
  markdownToHtml,
  normalizeMarkdown,
  preloadMarkdownConverter,
} from "./lib/admin-markdown.js";

export interface RichTextEditorHandle {
  insertImage: (src: string, alt: string) => void;
}

export interface RichTextEditorProps {
  markdown: string;
  onChange: (markdown: string) => void;
  /** ツールバーの画像ボタンから、親が持つファイル選択を開く */
  onRequestImage: () => void;
  /**
   * false にすると本文を編集できなくし、ツールバーも出さない（閲覧専用ユーザー向け）。
   * 既定は true。
   */
  editable?: boolean;
}

const editorClassName = [
  "[&_.tiptap]:min-h-[460px] [&_.tiptap]:outline-none",
  "[&_.tiptap_h2]:mt-7 [&_.tiptap_h2]:text-[22px] [&_.tiptap_h2]:font-bold [&_.tiptap_h2]:leading-tight",
  "[&_.tiptap_h3]:mt-6 [&_.tiptap_h3]:text-[18px] [&_.tiptap_h3]:font-bold",
  "[&_.tiptap_p]:my-3 [&_.tiptap_p]:leading-8",
  "[&_.tiptap_ul]:my-3 [&_.tiptap_ul]:list-disc [&_.tiptap_ul]:pl-6",
  "[&_.tiptap_ol]:my-3 [&_.tiptap_ol]:list-decimal [&_.tiptap_ol]:pl-6",
  "[&_.tiptap_li]:my-1",
  "[&_.tiptap_blockquote]:my-4 [&_.tiptap_blockquote]:border-l-4 [&_.tiptap_blockquote]:border-border [&_.tiptap_blockquote]:pl-4 [&_.tiptap_blockquote]:text-foreground/70",
  "[&_.tiptap_img]:my-4 [&_.tiptap_img]:w-full [&_.tiptap_img]:rounded-lg",
  "[&_.tiptap_a]:underline",
  "[&_.tiptap_hr]:my-7 [&_.tiptap_hr]:border-border",
  "[&_.tiptap_strong]:font-bold",
].join(" ");

interface ToolButtonProps {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}

function ToolButton({ label, active, disabled, onClick, children }: ToolButtonProps) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      // mousedown を止めないと、押した瞬間に本文の選択が外れて書式が当たらない
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={`flex h-9 min-w-9 items-center justify-center gap-1 rounded-md px-2 text-[12px] font-bold disabled:opacity-35 ${
        active ? "bg-foreground text-background" : "text-foreground/75 hover:bg-muted"
      }`}
    >
      {children}
    </button>
  );
}

export const RichTextEditor = forwardRef<RichTextEditorHandle, RichTextEditorProps>(
  function RichTextEditor({ markdown, onChange, onRequestImage, editable = true }, ref) {
    // 親から渡された markdown と、自分が最後に親へ返した markdown を突き合わせて、
    // 自分の編集が setContent で巻き戻る無限ループを防ぐ
    const lastEmitted = useRef<string>(normalizeMarkdown(markdown));
    const onChangeRef = useRef(onChange);
    useEffect(() => {
      onChangeRef.current = onChange;
    }, [onChange]);

    // HTML → マークダウンの変換器はブラウザでしか動かないので、表示された時点で読み込む。
    // 最初の入力で変換が一拍待たされるのを避けるだけで、無くても動く。
    useEffect(() => {
      void preloadMarkdownConverter();
    }, []);

    // 変換が非同期なので、入力が続くと応答の順序が入れ替わりうる。
    // 最後に見た HTML と一致するときだけ親へ返し、古い結果で上書きしない。
    const latestHtml = useRef<string>("");

    const [linkOpen, setLinkOpen] = useState(false);
    const [linkUrl, setLinkUrl] = useState("");

    const editor = useEditor({
      // サーバーレンダリングとのハイドレーションずれを起こさないために必須
      immediatelyRender: false,
      editable,
      extensions: [
        StarterKit.configure({
          // 記事タイトルが H1 なので、本文の見出しは H2 / H3 に限定する
          heading: { levels: [2, 3] },
          codeBlock: false,
          link: {
            openOnClick: false,
            autolink: true,
            HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
          },
        }),
        Image.configure({ inline: false, allowBase64: false }),
      ],
      content: markdownToHtml(markdown),
      editorProps: {
        attributes: {
          class: "tiptap",
          spellcheck: "false",
        },
      },
      onUpdate: ({ editor: instance }) => {
        const html = instance.getHTML();
        latestHtml.current = html;
        void htmlToMarkdown(html).then((markdownText) => {
          if (latestHtml.current !== html) return;
          const next = normalizeMarkdown(markdownText);
          lastEmitted.current = next;
          onChangeRef.current(next);
        });
      },
    });

    // 権限は /api/admin/me の応答後に確定するため、生成時のオプションだけでは足りない。
    // editable が変わったらエディタへ反映する。
    useEffect(() => {
      editor?.setEditable(editable);
    }, [editor, editable]);

    // 記事の読み込みなど、親側で本文が差し替わったときにエディタへ反映する
    useEffect(() => {
      if (!editor) return;
      const incoming = normalizeMarkdown(markdown);
      if (incoming === lastEmitted.current) return;
      lastEmitted.current = incoming;
      editor.commands.setContent(markdownToHtml(incoming), { emitUpdate: false });
    }, [editor, markdown]);

    useImperativeHandle(
      ref,
      () => ({
        insertImage(src: string, alt: string) {
          editor?.chain().focus().setImage({ src, alt }).run();
        },
      }),
      [editor]
    );

    const openLinkInput = useCallback(() => {
      if (!editor) return;
      setLinkUrl(editor.getAttributes("link").href || "");
      setLinkOpen(true);
    }, [editor]);

    const applyLink = useCallback(() => {
      if (!editor) return;
      const url = linkUrl.trim();
      if (!url) {
        editor.chain().focus().extendMarkRange("link").unsetLink().run();
      } else {
        editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
      }
      setLinkOpen(false);
      setLinkUrl("");
    }, [editor, linkUrl]);

    if (!editor) {
      return (
        <div className="mt-2 min-h-[520px] rounded-lg border border-border bg-background px-3 py-3 text-[13px] text-foreground/45">
          エディタを読み込んでいます…
        </div>
      );
    }

    return (
      <div className="mt-2 rounded-lg border border-border bg-background">
        {editable ? (
          <div className="flex flex-wrap items-center gap-1 border-b border-border p-2">
            <ToolButton
              label="見出し（大）"
              active={editor.isActive("heading", { level: 2 })}
              onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            >
              <Heading2 size={16} />
            </ToolButton>
            <ToolButton
              label="見出し（小）"
              active={editor.isActive("heading", { level: 3 })}
              onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            >
              <Heading3 size={16} />
            </ToolButton>

            <span className="mx-1 h-5 w-px bg-border" />

            <ToolButton
              label="太字"
              active={editor.isActive("bold")}
              onClick={() => editor.chain().focus().toggleBold().run()}
            >
              <Bold size={16} />
            </ToolButton>
            <ToolButton
              label="斜体"
              active={editor.isActive("italic")}
              onClick={() => editor.chain().focus().toggleItalic().run()}
            >
              <Italic size={16} />
            </ToolButton>

            <span className="mx-1 h-5 w-px bg-border" />

            <ToolButton
              label="箇条書き"
              active={editor.isActive("bulletList")}
              onClick={() => editor.chain().focus().toggleBulletList().run()}
            >
              <List size={16} />
            </ToolButton>
            <ToolButton
              label="番号付きリスト"
              active={editor.isActive("orderedList")}
              onClick={() => editor.chain().focus().toggleOrderedList().run()}
            >
              <ListOrdered size={16} />
            </ToolButton>
            <ToolButton
              label="引用"
              active={editor.isActive("blockquote")}
              onClick={() => editor.chain().focus().toggleBlockquote().run()}
            >
              <Quote size={16} />
            </ToolButton>
            <ToolButton
              label="区切り線"
              onClick={() => editor.chain().focus().setHorizontalRule().run()}
            >
              <Minus size={16} />
            </ToolButton>

            <span className="mx-1 h-5 w-px bg-border" />

            <ToolButton label="リンク" active={editor.isActive("link")} onClick={openLinkInput}>
              <Link2 size={16} />
            </ToolButton>
            {editor.isActive("link") ? (
              <ToolButton
                label="リンクを外す"
                onClick={() => editor.chain().focus().extendMarkRange("link").unsetLink().run()}
              >
                <Link2Off size={16} />
              </ToolButton>
            ) : null}
            <ToolButton label="画像を挿入" onClick={onRequestImage}>
              <ImagePlus size={16} />
            </ToolButton>

            <span className="ml-auto flex items-center gap-1">
              <ToolButton
                label="元に戻す"
                disabled={!editor.can().undo()}
                onClick={() => editor.chain().focus().undo().run()}
              >
                <Undo2 size={16} />
              </ToolButton>
              <ToolButton
                label="やり直す"
                disabled={!editor.can().redo()}
                onClick={() => editor.chain().focus().redo().run()}
              >
                <Redo2 size={16} />
              </ToolButton>
            </span>
          </div>
        ) : null}

        {linkOpen ? (
          <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted px-2 py-2">
            <input
              value={linkUrl}
              onChange={(event) => setLinkUrl(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  applyLink();
                }
                if (event.key === "Escape") setLinkOpen(false);
              }}
              autoFocus
              placeholder="https://example.com/"
              className="h-9 min-w-0 flex-1 rounded-md border border-border bg-background px-3 text-[14px] outline-none focus:border-foreground"
            />
            <button
              type="button"
              onClick={applyLink}
              className="h-9 rounded-md bg-foreground px-3 text-[12px] font-bold text-background"
            >
              リンクを設定
            </button>
            <button
              type="button"
              onClick={() => setLinkOpen(false)}
              className="h-9 rounded-md border border-border px-3 text-[12px] font-bold"
            >
              やめる
            </button>
          </div>
        ) : null}

        <div className={`px-3 py-3 text-[15px] ${editorClassName}`}>
          <EditorContent editor={editor} />
        </div>
      </div>
    );
  }
);
