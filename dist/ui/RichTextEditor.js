"use client";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// マークダウン記法を覚えなくても記事を書けるようにするためのリッチエディタ。
// 表示は HTML だが、親コンポーネントへ渡す値はマークダウンのまま。
// 記事の保存形式と公開の流れは変わらない。
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { Bold, Heading2, Heading3, ImagePlus, Italic, Link2, Link2Off, List, ListOrdered, Minus, Quote, Redo2, Undo2, } from "lucide-react";
import { htmlToMarkdown, markdownToHtml, normalizeMarkdown } from "./lib/admin-markdown.js";
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
function ToolButton({ label, active, disabled, onClick, children }) {
    return (_jsx("button", { type: "button", title: label, "aria-label": label, "aria-pressed": active, disabled: disabled, 
        // mousedown を止めないと、押した瞬間に本文の選択が外れて書式が当たらない
        onMouseDown: (event) => event.preventDefault(), onClick: onClick, className: `flex h-9 min-w-9 items-center justify-center gap-1 rounded-md px-2 text-[12px] font-bold disabled:opacity-35 ${active ? "bg-foreground text-background" : "text-foreground/75 hover:bg-muted"}`, children: children }));
}
export const RichTextEditor = forwardRef(function RichTextEditor({ markdown, onChange, onRequestImage }, ref) {
    // 親から渡された markdown と、自分が最後に親へ返した markdown を突き合わせて、
    // 自分の編集が setContent で巻き戻る無限ループを防ぐ
    const lastEmitted = useRef(normalizeMarkdown(markdown));
    const onChangeRef = useRef(onChange);
    useEffect(() => {
        onChangeRef.current = onChange;
    }, [onChange]);
    const [linkOpen, setLinkOpen] = useState(false);
    const [linkUrl, setLinkUrl] = useState("");
    const editor = useEditor({
        // サーバーレンダリングとのハイドレーションずれを起こさないために必須
        immediatelyRender: false,
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
            const next = normalizeMarkdown(htmlToMarkdown(instance.getHTML()));
            lastEmitted.current = next;
            onChangeRef.current(next);
        },
    });
    // 記事の読み込みなど、親側で本文が差し替わったときにエディタへ反映する
    useEffect(() => {
        if (!editor)
            return;
        const incoming = normalizeMarkdown(markdown);
        if (incoming === lastEmitted.current)
            return;
        lastEmitted.current = incoming;
        editor.commands.setContent(markdownToHtml(incoming), { emitUpdate: false });
    }, [editor, markdown]);
    useImperativeHandle(ref, () => ({
        insertImage(src, alt) {
            editor?.chain().focus().setImage({ src, alt }).run();
        },
    }), [editor]);
    const openLinkInput = useCallback(() => {
        if (!editor)
            return;
        setLinkUrl(editor.getAttributes("link").href || "");
        setLinkOpen(true);
    }, [editor]);
    const applyLink = useCallback(() => {
        if (!editor)
            return;
        const url = linkUrl.trim();
        if (!url) {
            editor.chain().focus().extendMarkRange("link").unsetLink().run();
        }
        else {
            editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
        }
        setLinkOpen(false);
        setLinkUrl("");
    }, [editor, linkUrl]);
    if (!editor) {
        return (_jsx("div", { className: "mt-2 min-h-[520px] rounded-lg border border-border bg-background px-3 py-3 text-[13px] text-foreground/45", children: "\u30A8\u30C7\u30A3\u30BF\u3092\u8AAD\u307F\u8FBC\u3093\u3067\u3044\u307E\u3059\u2026" }));
    }
    return (_jsxs("div", { className: "mt-2 rounded-lg border border-border bg-background", children: [_jsxs("div", { className: "flex flex-wrap items-center gap-1 border-b border-border p-2", children: [_jsx(ToolButton, { label: "\u898B\u51FA\u3057\uFF08\u5927\uFF09", active: editor.isActive("heading", { level: 2 }), onClick: () => editor.chain().focus().toggleHeading({ level: 2 }).run(), children: _jsx(Heading2, { size: 16 }) }), _jsx(ToolButton, { label: "\u898B\u51FA\u3057\uFF08\u5C0F\uFF09", active: editor.isActive("heading", { level: 3 }), onClick: () => editor.chain().focus().toggleHeading({ level: 3 }).run(), children: _jsx(Heading3, { size: 16 }) }), _jsx("span", { className: "mx-1 h-5 w-px bg-border" }), _jsx(ToolButton, { label: "\u592A\u5B57", active: editor.isActive("bold"), onClick: () => editor.chain().focus().toggleBold().run(), children: _jsx(Bold, { size: 16 }) }), _jsx(ToolButton, { label: "\u659C\u4F53", active: editor.isActive("italic"), onClick: () => editor.chain().focus().toggleItalic().run(), children: _jsx(Italic, { size: 16 }) }), _jsx("span", { className: "mx-1 h-5 w-px bg-border" }), _jsx(ToolButton, { label: "\u7B87\u6761\u66F8\u304D", active: editor.isActive("bulletList"), onClick: () => editor.chain().focus().toggleBulletList().run(), children: _jsx(List, { size: 16 }) }), _jsx(ToolButton, { label: "\u756A\u53F7\u4ED8\u304D\u30EA\u30B9\u30C8", active: editor.isActive("orderedList"), onClick: () => editor.chain().focus().toggleOrderedList().run(), children: _jsx(ListOrdered, { size: 16 }) }), _jsx(ToolButton, { label: "\u5F15\u7528", active: editor.isActive("blockquote"), onClick: () => editor.chain().focus().toggleBlockquote().run(), children: _jsx(Quote, { size: 16 }) }), _jsx(ToolButton, { label: "\u533A\u5207\u308A\u7DDA", onClick: () => editor.chain().focus().setHorizontalRule().run(), children: _jsx(Minus, { size: 16 }) }), _jsx("span", { className: "mx-1 h-5 w-px bg-border" }), _jsx(ToolButton, { label: "\u30EA\u30F3\u30AF", active: editor.isActive("link"), onClick: openLinkInput, children: _jsx(Link2, { size: 16 }) }), editor.isActive("link") ? (_jsx(ToolButton, { label: "\u30EA\u30F3\u30AF\u3092\u5916\u3059", onClick: () => editor.chain().focus().extendMarkRange("link").unsetLink().run(), children: _jsx(Link2Off, { size: 16 }) })) : null, _jsx(ToolButton, { label: "\u753B\u50CF\u3092\u633F\u5165", onClick: onRequestImage, children: _jsx(ImagePlus, { size: 16 }) }), _jsxs("span", { className: "ml-auto flex items-center gap-1", children: [_jsx(ToolButton, { label: "\u5143\u306B\u623B\u3059", disabled: !editor.can().undo(), onClick: () => editor.chain().focus().undo().run(), children: _jsx(Undo2, { size: 16 }) }), _jsx(ToolButton, { label: "\u3084\u308A\u76F4\u3059", disabled: !editor.can().redo(), onClick: () => editor.chain().focus().redo().run(), children: _jsx(Redo2, { size: 16 }) })] })] }), linkOpen ? (_jsxs("div", { className: "flex flex-wrap items-center gap-2 border-b border-border bg-muted px-2 py-2", children: [_jsx("input", { value: linkUrl, onChange: (event) => setLinkUrl(event.target.value), onKeyDown: (event) => {
                            if (event.key === "Enter") {
                                event.preventDefault();
                                applyLink();
                            }
                            if (event.key === "Escape")
                                setLinkOpen(false);
                        }, autoFocus: true, placeholder: "https://example.com/", className: "h-9 min-w-0 flex-1 rounded-md border border-border bg-background px-3 text-[14px] outline-none focus:border-foreground" }), _jsx("button", { type: "button", onClick: applyLink, className: "h-9 rounded-md bg-foreground px-3 text-[12px] font-bold text-background", children: "\u30EA\u30F3\u30AF\u3092\u8A2D\u5B9A" }), _jsx("button", { type: "button", onClick: () => setLinkOpen(false), className: "h-9 rounded-md border border-border px-3 text-[12px] font-bold", children: "\u3084\u3081\u308B" })] })) : null, _jsx("div", { className: `px-3 py-3 text-[15px] ${editorClassName}`, children: _jsx(EditorContent, { editor: editor }) })] }));
});
