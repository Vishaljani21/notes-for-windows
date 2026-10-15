import React, { useEffect, useRef } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import { Node, mergeAttributes } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import Highlight from "@tiptap/extension-highlight";
import { TableKit } from "@tiptap/extension-table";
import {
  Details,
  DetailsContent,
  DetailsSummary,
} from "@tiptap/extension-details";
import DOMPurify from "dompurify";

export const cleanHTML = (html) =>
  DOMPurify.sanitize(html, {
    ADD_TAGS: ["audio"],
    ADD_ATTR: [
      "controls",
      "data-type",
      "data-checked",
      "data-name",
      "data-size",
      "download",
    ],
    ALLOW_DATA_ATTR: true,
    ADD_DATA_URI_TAGS: ["audio", "a"],
  });
const Attachment = Node.create({
  name: "attachment",
  group: "block",
  atom: true,
  addAttributes() {
    return {
      href: { default: null },
      name: { default: "Attachment" },
      size: { default: "" },
    };
  },
  parseHTML() {
    return [
      {
        tag: 'a[data-type="attachment"]',
        getAttrs: (el) => ({
          href: el.getAttribute("href"),
          name: el.getAttribute("data-name"),
          size: el.getAttribute("data-size"),
        }),
      },
    ];
  },
  renderHTML({ node }) {
    return [
      "a",
      {
        "data-type": "attachment",
        class: "attachment",
        href: node.attrs.href,
        download: node.attrs.name,
        "data-name": node.attrs.name,
        "data-size": node.attrs.size,
        contenteditable: "false",
      },
      ["span", { class: "attachment-icon" }, "↧"],
      [
        "span",
        {},
        ["strong", {}, node.attrs.name],
        ["small", {}, node.attrs.size + " · Click to save"],
      ],
    ];
  },
});
// Keep clips saved by earlier versions readable when notes are edited or exported.
const AudioClip = Node.create({
  name: "audioClip",
  group: "block",
  atom: true,
  addAttributes() {
    return { src: { default: null } };
  },
  parseHTML() {
    return [
      { tag: "audio", getAttrs: (el) => ({ src: el.getAttribute("src") }) },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "audio",
      mergeAttributes(HTMLAttributes, {
        controls: "",
        preload: "metadata",
        class: "audio-clip",
      }),
    ];
  },
});
export default function NoteEditor({
  note,
  onChange,
  onReady,
  onNoteLink,
  onLinkRequest,
  fontSize,
}) {
  const change = useRef(onChange);
  change.current = onChange;
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: {
          openOnClick: false,
          protocols: ["https", "http", "mailto", "note"],
          HTMLAttributes: { rel: "noopener noreferrer" },
        },
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Image.configure({ allowBase64: true }),
      TableKit.configure({ table: { resizable: true } }),
      Highlight.configure({ multicolor: true }),
      Details.configure({ persist: true }),
      DetailsContent,
      DetailsSummary,
      Attachment,
      AudioClip,
      Placeholder.configure({
        placeholder: "Start writing, or let an idea find you…",
      }),
    ],
    content: cleanHTML(note.content || "<p></p>"),
    editable: !note.deletedAt,
    editorProps: {
      attributes: {
        class: "note-prose",
        spellcheck: "true",
        "aria-label": "Note content",
      },
      handleClick: (_, __, event) => {
        const a = event.target.closest("a"),
          href = a?.getAttribute("href");
        if (href?.startsWith("note:")) {
          event.preventDefault();
          onNoteLink(href.slice(5));
          return true;
        }
        if (
          href &&
          /^(https?:\/\/|mailto:)/i.test(href) &&
          (event.ctrlKey || event.metaKey)
        ) {
          event.preventDefault();
          if (window.desktop) window.desktop.openExternal(href);
          else window.open(href, "_blank", "noopener,noreferrer");
          return true;
        }
        return false;
      },
      handleKeyDown: (view, event) => {
        if (
          event.key === ">" &&
          view.state.selection.empty &&
          view.state.selection.from > 1 &&
          view.state.doc.textBetween(
            view.state.selection.from - 1,
            view.state.selection.from,
          ) === ">"
        ) {
          view.dispatch(
            view.state.tr.delete(
              view.state.selection.from - 1,
              view.state.selection.from,
            ),
          );
          onLinkRequest?.();
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor }) => change.current(editor.getHTML()),
    immediatelyRender: true,
  });
  useEffect(() => {
    editor?.setEditable(!note.deletedAt);
  }, [editor, note.deletedAt]);
  useEffect(() => {
    onReady(editor);
    return () => onReady(null);
  }, [editor]);
  return (
    <EditorContent
      editor={editor}
      style={{ "--editor-size": fontSize + "px" }}
    />
  );
}
