import React, { useEffect, useRef, useState } from "react";
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
import { DOMSerializer } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";
import {
  Undo2,
  Redo2,
  Scissors,
  Copy,
  ClipboardPaste,
  TextSelect,
  Type,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  ListChecks,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Highlighter,
  Quote,
  Code2,
  Table2,
  Link2,
  Unlink,
  ChevronRight,
  Plus,
  Minus,
  X,
} from "lucide-react";
import ContextMenu from "./ContextMenu.jsx";
import "./divider.css";

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
  const [contextMenu, setContextMenu] = useState(null);
  const [clipboardError, setClipboardError] = useState("");
  const selectionBeforePointer = useRef(null);
  const menuSelection = useRef(null);
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
    setContextMenu(null);
  }, [editor, note.deletedAt]);
  useEffect(() => {
    onReady(editor);
    return () => onReady(null);
  }, [editor]);

  const restoreSelection = () => {
    if (!editor || editor.isDestroyed) return false;
    if (menuSelection.current) {
      try {
        const selection = menuSelection.current.resolve(editor.state.doc);
        editor.view.dispatch(editor.state.tr.setSelection(selection));
      } catch {
        return false;
      }
    }
    return true;
  };
  const runCommand =
    (command, ...args) =>
    () => {
      if (!editor?.isEditable || !restoreSelection()) return;
      editor
        .chain()
        .focus()
        [command](...args)
        .run();
    };
  const openContextMenu = (event, keyboard = false) => {
    if (!editor || editor.isDestroyed) return;
    event.preventDefault();
    event.stopPropagation();
    if (!keyboard) {
      const point = editor.view.posAtCoords({
        left: event.clientX,
        top: event.clientY,
      });
      if (point) {
        const before = selectionBeforePointer.current || editor.state.selection;
        const insideSelection =
          !before.empty && point.pos >= before.from && point.pos <= before.to;
        const selection = insideSelection
          ? before.getBookmark().resolve(editor.state.doc)
          : TextSelection.near(editor.state.doc.resolve(point.pos));
        editor.view.dispatch(editor.state.tr.setSelection(selection));
      }
    }
    selectionBeforePointer.current = null;
    menuSelection.current = editor.state.selection.getBookmark();
    const caret = keyboard
      ? editor.view.coordsAtPos(editor.state.selection.to)
      : null;
    setClipboardError("");
    setContextMenu({
      x: caret?.left ?? event.clientX,
      y: caret?.bottom ?? event.clientY,
    });
  };
  const clipboardAction = (operation) => async () => {
    if (!editor || !restoreSelection()) return;
    const documentBefore = editor.state.doc;
    const selection = editor.state.selection;
    const bookmark = selection.getBookmark();
    try {
      if (operation === "paste") {
        if (!editor.isEditable) return;
        let html = "";
        let text = "";
        if (window.desktop?.readClipboard) {
          const content = await window.desktop.readClipboard();
          if (content?.ok === false)
            throw new Error(
              content.error ||
                "Clipboard access was blocked. Use Ctrl+V to paste.",
            );
          html = typeof content?.html === "string" ? content.html : "";
          text = typeof content?.text === "string" ? content.text : "";
        } else if (navigator.clipboard?.read) {
          const entries = await navigator.clipboard.read();
          for (const entry of entries) {
            if (entry.types.includes("text/html"))
              html = await (await entry.getType("text/html")).text();
            if (entry.types.includes("text/plain"))
              text = await (await entry.getType("text/plain")).text();
            if (html || text) break;
          }
        } else if (navigator.clipboard?.readText)
          text = await navigator.clipboard.readText();
        else
          throw new Error(
            "Clipboard access is unavailable. Use Ctrl+V to paste.",
          );
        if (editor.isDestroyed) return;
        if (!html && !text)
          throw new Error(
            "The clipboard has no text to paste. Use Ctrl+V for images or other content.",
          );
        if (!editor.isEditable || !documentBefore.eq(editor.state.doc))
          throw new Error(
            "The note changed while reading the clipboard. Place the cursor and paste again.",
          );
        editor.view.dispatch(
          editor.state.tr.setSelection(bookmark.resolve(editor.state.doc)),
        );
        const content = html
          ? cleanHTML(html)
          : text
              .split(/\r\n|\r|\n/)
              .map((line) => ({
                type: "paragraph",
                content: line ? [{ type: "text", text: line }] : [],
              }));
        if (!editor.chain().focus().insertContent(content).run())
          throw new Error(
            "This clipboard content could not be pasted. Try Ctrl+V.",
          );
      } else {
        const content = document.createElement("div");
        content.appendChild(
          DOMSerializer.fromSchema(editor.schema).serializeFragment(
            selection.content().content,
          ),
        );
        const text = editor.state.doc.textBetween(
          selection.from,
          selection.to,
          "\n",
        );
        if (window.desktop?.writeClipboard) {
          const result = await window.desktop.writeClipboard({
            text,
            html: content.innerHTML,
          });
          if (result?.ok === false)
            throw new Error(
              result.error ||
                `Clipboard access was blocked. Use Ctrl+${operation === "cut" ? "X" : "C"}.`,
            );
        } else if (navigator.clipboard?.write && window.ClipboardItem) {
          await navigator.clipboard.write([
            new ClipboardItem({
              "text/plain": new Blob([text], { type: "text/plain" }),
              "text/html": new Blob([content.innerHTML], { type: "text/html" }),
            }),
          ]);
        } else if (navigator.clipboard?.writeText)
          await navigator.clipboard.writeText(text);
        else
          throw new Error(
            `Clipboard access is unavailable. Use Ctrl+${operation === "cut" ? "X" : "C"}.`,
          );
        if (editor.isDestroyed) return;
        if (operation === "cut") {
          if (!editor.isEditable || !documentBefore.eq(editor.state.doc))
            throw new Error(
              "Text was copied, but the note changed before cutting. Select the text again.",
            );
          editor.view.dispatch(
            editor.state.tr
              .setSelection(bookmark.resolve(editor.state.doc))
              .deleteSelection(),
          );
        }
        editor.commands.focus();
      }
    } catch (error) {
      if (editor.isDestroyed) return;
      const shortcut =
        operation === "paste"
          ? "Ctrl+V"
          : operation === "cut"
            ? "Ctrl+X"
            : "Ctrl+C";
      setClipboardError(
        error.name === "NotAllowedError" || error.name === "SecurityError"
          ? `Clipboard access was blocked. Use ${shortcut} in the note, or allow clipboard access.`
          : error.message ||
              `Couldn't ${operation}. Use ${shortcut} in the note.`,
      );
      editor.commands.focus();
    }
  };
  const canEdit = !!editor?.isEditable;
  const hasSelection = !!editor && !editor.state.selection.empty;
  const formatItem = (label, icon, command, active, args) => ({
    label,
    icon,
    checked: editor?.isActive(...active) || false,
    onSelect: runCommand(command, ...(args || [])),
  });
  const contextItems = editor
    ? [
        ...(canEdit
          ? [
              {
                label: "Undo",
                icon: Undo2,
                shortcut: "Ctrl+Z",
                disabled: !editor.can().undo(),
                onSelect: runCommand("undo"),
              },
              {
                label: "Redo",
                icon: Redo2,
                shortcut: "Ctrl+Y",
                disabled: !editor.can().redo(),
                onSelect: runCommand("redo"),
              },
              { separator: true },
              {
                label: "Cut",
                icon: Scissors,
                shortcut: "Ctrl+X",
                disabled: !hasSelection,
                onSelect: clipboardAction("cut"),
              },
            ]
          : []),
        {
          label: "Copy",
          icon: Copy,
          shortcut: "Ctrl+C",
          disabled: !hasSelection,
          onSelect: clipboardAction("copy"),
        },
        ...(canEdit
          ? [
              {
                label: "Paste",
                icon: ClipboardPaste,
                shortcut: "Ctrl+V",
                onSelect: clipboardAction("paste"),
              },
            ]
          : []),
        {
          label: "Select all",
          icon: TextSelect,
          shortcut: "Ctrl+A",
          onSelect: () => {
            editor.chain().focus().selectAll().run();
          },
        },
        ...(canEdit
          ? [
              { separator: true },
              {
                label: "Insert",
                icon: Plus,
                items: [
                  {
                    label: "Horizontal divider",
                    icon: Minus,
                    disabled: !editor.can().setHorizontalRule(),
                    onSelect: runCommand("setHorizontalRule"),
                  },
                ],
              },
              {
                label: "Text style",
                icon: Type,
                items: [
                  formatItem("Paragraph", Type, "setParagraph", ["paragraph"]),
                  formatItem(
                    "Heading 1",
                    Heading1,
                    "toggleHeading",
                    ["heading", { level: 1 }],
                    [{ level: 1 }],
                  ),
                  formatItem(
                    "Heading 2",
                    Heading2,
                    "toggleHeading",
                    ["heading", { level: 2 }],
                    [{ level: 2 }],
                  ),
                  formatItem(
                    "Heading 3",
                    Heading3,
                    "toggleHeading",
                    ["heading", { level: 3 }],
                    [{ level: 3 }],
                  ),
                  { separator: true },
                  formatItem("Block quote", Quote, "toggleBlockquote", [
                    "blockquote",
                  ]),
                  formatItem("Code block", Code2, "toggleCodeBlock", [
                    "codeBlock",
                  ]),
                  {
                    label: "Collapsible section",
                    icon: ChevronRight,
                    onSelect: runCommand(
                      "insertContent",
                      '<div data-type="details" open><summary>Section title</summary><div data-type="detailsContent"><p>Add something here…</p></div></div>',
                    ),
                  },
                ],
              },
              {
                label: "Lists",
                icon: List,
                items: [
                  formatItem("Bulleted list", List, "toggleBulletList", [
                    "bulletList",
                  ]),
                  formatItem(
                    "Numbered list",
                    ListOrdered,
                    "toggleOrderedList",
                    ["orderedList"],
                  ),
                  formatItem("Checklist", ListChecks, "toggleTaskList", [
                    "taskList",
                  ]),
                ],
              },
              {
                label: "Format",
                icon: Bold,
                items: [
                  formatItem("Bold", Bold, "toggleBold", ["bold"]),
                  formatItem("Italic", Italic, "toggleItalic", ["italic"]),
                  formatItem("Underline", Underline, "toggleUnderline", [
                    "underline",
                  ]),
                  formatItem("Strikethrough", Strikethrough, "toggleStrike", [
                    "strike",
                  ]),
                  formatItem("Highlight", Highlighter, "toggleHighlight", [
                    "highlight",
                  ]),
                  formatItem("Inline code", Code2, "toggleCode", ["code"]),
                  { separator: true },
                  {
                    label: "Clear formatting",
                    onSelect: () => {
                      if (editor.isEditable && restoreSelection())
                        editor.chain().focus().unsetAllMarks().run();
                    },
                  },
                ],
              },
              {
                label: "Table",
                icon: Table2,
                items: editor.isActive("table")
                  ? [
                      ["Add row above", "addRowBefore"],
                      ["Add row below", "addRowAfter"],
                      ["Add column before", "addColumnBefore"],
                      ["Add column after", "addColumnAfter"],
                      ["Toggle header row", "toggleHeaderRow"],
                      ["Delete row", "deleteRow"],
                      ["Delete column", "deleteColumn"],
                      ["Delete table", "deleteTable"],
                    ].map(([label, command]) => ({
                      label,
                      danger: command.startsWith("delete"),
                      disabled: !editor.can()[command](),
                      onSelect: runCommand(command),
                    }))
                  : [
                      {
                        label: "Insert table (3 × 3)",
                        onSelect: runCommand("insertTable", {
                          rows: 3,
                          cols: 3,
                          withHeaderRow: true,
                        }),
                      },
                    ],
              },
              { separator: true },
              {
                label: "Add link…",
                icon: Link2,
                onSelect: () => {
                  if (editor.isEditable && restoreSelection())
                    onLinkRequest?.();
                },
              },
              {
                label: "Remove link",
                icon: Unlink,
                disabled: !editor.isActive("link"),
                onSelect: runCommand("unsetLink"),
              },
            ]
          : []),
      ]
    : [];
  return (
    <>
      {clipboardError && (
        <div className="editor-context-error" role="alert">
          <span>{clipboardError}</span>
          <button
            type="button"
            aria-label="Dismiss clipboard message"
            onClick={() => setClipboardError("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
      <EditorContent
        editor={editor}
        style={{ "--editor-size": fontSize + "px" }}
        onPointerDownCapture={(event) => {
          if (event.button === 2 && editor)
            selectionBeforePointer.current = editor.state.selection;
        }}
        onContextMenu={openContextMenu}
        onKeyDownCapture={(event) => {
          if (
            event.key === "ContextMenu" ||
            (event.shiftKey && event.key === "F10")
          )
            openContextMenu(event, true);
        }}
      />
      {contextMenu && (
        <ContextMenu
          key={`${contextMenu.x}-${contextMenu.y}`}
          position={contextMenu}
          label="Note editor actions"
          items={contextItems}
          onClose={() => setContextMenu(null)}
        />
      )}
    </>
  );
}
