import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  NotebookPen,
  PanelLeft,
  Search,
  SquarePen,
  Folder,
  FolderPlus,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Hash,
  Trash2,
  Pin,
  CheckCheck,
  Check,
  MoreHorizontal,
  Settings,
  Plus,
  LayoutGrid,
  List,
  ArrowDownWideNarrow,
  LockKeyhole,
  LockKeyholeOpen,
  Share,
  Table2,
  Paperclip,
  ImagePlus,
  Mic,
  Bell,
  ScanLine,
  Link2,
  Calculator,
  Heading2,
  Quote,
  ListOrdered,
  ListTodo,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Highlighter,
  FileText,
  ArrowUpRight,
  X,
  Minus,
  Square,
  Sun,
  Moon,
  Monitor,
  Download,
  Upload,
  RotateCcw,
  Copy,
  ArrowRight,
  Sparkles,
  Keyboard,
  Info,
  LoaderCircle,
  FolderOpen,
  ChevronUp,
  CircleHelp,
  ShieldCheck,
  Circle,
  Heading1,
  Type,
  Code2,
} from "lucide-react";
import NoteEditor, { cleanHTML } from "./Editor.jsx";
import FontPicker from "./FontPicker.jsx";
import { getFontStack, FONTS } from "./fonts.mjs";
import {
  AudioTool,
  AudioQuestions,
  qaAnswersToNodes,
  ScanTool,
  fileDataURL,
} from "./MediaTools.jsx";
import ReminderDialog from "./ReminderDialog.jsx";
import { formatReminder, isReminderTimestamp } from "./reminders.mjs";
import {
  uid,
  escapeHTML,
  plainText,
  descendants,
  validateLibrary,
  seedLibrary,
  encryptNote,
  decryptNote,
  summarize,
} from "./lib.mjs";
import { loadLibrary, saveLibrary, download } from "./storage.js";

const INITIAL = seedLibrary();
let saveQueue = Promise.resolve();
const today = (time) =>
  new Date(time).toDateString() === new Date().toDateString();
const shortDate = (time) =>
  today(time)
    ? new Date(time).toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
      })
    : new Date(time).toLocaleDateString([], { month: "short", day: "numeric" });
const fullDate = (time) =>
  new Date(time).toLocaleDateString([], {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
const safeName = (name) =>
  (name || "Untitled").replace(/[<>:"/\\|?*\x00-\x1f]/g, "-").slice(0, 90);
function audioContextFromNote(html = "") {
  const document = new DOMParser().parseFromString(
    cleanHTML(html),
    "text/html",
  );
  const transcripts = [];
  for (const heading of document.querySelectorAll("h1,h2,h3")) {
    if (!/^(audio )?transcript$/i.test(heading.textContent.trim())) continue;
    const parts = [];
    for (
      let element = heading.nextElementSibling;
      element;
      element = element.nextElementSibling
    ) {
      if (/^H[1-3]$/.test(element.tagName)) break;
      if (element.textContent.trim()) parts.push(element.textContent.trim());
    }
    if (parts.length) transcripts.push(parts.join("\n\n"));
  }
  const audio = [...document.querySelectorAll("audio")].find((element) =>
    /^data:(audio\/[^;,]+|application\/octet-stream)[;,]/i.test(
      element.getAttribute("src") || "",
    ),
  );
  return {
    transcript: transcripts.join("\n\n"),
    audioSrc: audio?.getAttribute("src") || "",
  };
}
function IconButton({
  icon: Icon,
  label,
  onClick,
  active = false,
  disabled,
  className = "",
  children,
}) {
  return (
    <button
      className={`icon-button ${active ? "active" : ""} ${className}`}
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
    >
      <Icon size={19} strokeWidth={1.7} />
      {children}
    </button>
  );
}
function MenuItem({
  icon: Icon,
  children,
  onClick,
  shortcut,
  danger,
  disabled,
}) {
  return (
    <button
      className={`menu-item ${danger ? "danger" : ""}`}
      onClick={onClick}
      disabled={disabled}
    >
      {Icon && <Icon size={16} />}
      <span>{children}</span>
      {shortcut && <small>{shortcut}</small>}
    </button>
  );
}
function Modal({ children, close, wide = false }) {
  const root = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    const handle = (e) => {
      if (e.key === "Escape") close();
      if (e.key === "Tab") {
        const focusable = [
          ...root.current.querySelectorAll(
            'button:not(:disabled), input:not(:disabled), select, textarea, [tabindex="0"]',
          ),
        ].filter((el) => !el.hidden && el.offsetParent !== null);
        const first = focusable[0],
          last = focusable.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", handle);
    setTimeout(
      () =>
        root.current
          ?.querySelector("[autofocus], input, textarea, button")
          ?.focus(),
      30,
    );
    return () => {
      document.removeEventListener("keydown", handle);
      previous?.focus?.();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && close()}
    >
      <section
        ref={root}
        role="dialog"
        aria-modal="true"
        className={`modal ${wide ? "wide" : ""}`}
      >
        <button
          className="modal-close icon-button"
          title="Close dialog"
          aria-label="Close dialog"
          onClick={close}
        >
          <X size={18} />
        </button>
        {children}
      </section>
    </div>
  );
}
async function materialize(data, unlocked) {
  const snapshot = structuredClone(data);
  for (const note of snapshot.notes)
    if (note.locked && unlocked[note.id]) {
      const u = unlocked[note.id];
      note.encrypted = await encryptNote(
        { content: u.content, tags: u.tags },
        u.password,
      );
      note.content = "";
      note.tags = [];
    }
  return snapshot;
}

export default function App() {
  const [library, setLibrary] = useState(INITIAL),
    [loaded, setLoaded] = useState(false),
    [loadError, setLoadError] = useState("");
  const [scope, setScope] = useState("all"),
    [selected, setSelected] = useState("welcome"),
    [query, setQuery] = useState(""),
    [sidebar, setSidebar] = useState(true),
    [expanded, setExpanded] = useState(new Set(["personal"])),
    [tagFilter, setTagFilter] = useState("");
  const [menu, setMenu] = useState(null),
    [modal, setModal] = useState(null),
    [unlocked, setUnlocked] = useState({}),
    [saveStatus, setSaveStatus] = useState("saved"),
    [toastMessage, setToastMessage] = useState(""),
    [editor, setEditor] = useState(null),
    [selectionTick, setSelectionTick] = useState(0);
  const [find, setFind] = useState("");
  useEffect(() => {
    const compact = matchMedia("(max-width: 820px)");
    const hideCompactNavigation = () => {
      if (compact.matches) setSidebar(false);
    };
    hideCompactNavigation();
    compact.addEventListener("change", hideCompactNavigation);
    return () => compact.removeEventListener("change", hideCompactNavigation);
  }, []);
  const searchRef = useRef(null),
    imageInput = useRef(null),
    attachmentInput = useRef(null),
    backupInput = useRef(null),
    saveGeneration = useRef(0),
    toastTimer = useRef(null),
    latest = useRef({ library, unlocked, loaded }),
    dirty = useRef(false);
  latest.current = { library, unlocked, loaded };
  const focusSearch = useCallback(() => {
    setSidebar(true);
    requestAnimationFrame(() => searchRef.current?.focus());
  }, []);
  useEffect(() => {
    if (!matchMedia("(max-width: 820px)").matches) return;
    const sidebarElement = document.querySelector(".sidebar");
    const toggle = document.querySelector(".compact-navigation-toggle");
    if (!sidebar) {
      if (sidebarElement?.contains(document.activeElement)) toggle?.focus();
      return;
    }
    const frame = requestAnimationFrame(() => searchRef.current?.focus());
    const handleDrawer = (event) => {
      if (document.querySelector('[role="dialog"]')) return;
      if (event.key === "Escape") {
        event.preventDefault();
        setSidebar(false);
      }
      if (event.key !== "Tab") return;
      const controls = [
        ...(sidebarElement?.querySelectorAll(
          'button:not(:disabled),input:not(:disabled),[tabindex="0"]',
        ) || []),
      ].filter(
        (el) =>
          el.offsetParent !== null &&
          getComputedStyle(el).visibility !== "hidden",
      );
      const first = controls[0],
        last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", handleDrawer);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleDrawer);
    };
  }, [sidebar]);
  const toast = useCallback((message) => {
    setToastMessage(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMessage(""), 4500);
  }, []);
  const receiveReminder = useCallback(
    ({ noteId, reminderAt, deliveredAt }) => {
      const note = latest.current.library.notes.find(
        (item) => item.id === noteId,
      );
      if (
        !note ||
        note.deletedAt ||
        note.reminderAt !== reminderAt ||
        note.reminderNotifiedAt >= reminderAt
      )
        return;
      setLibrary((library) => ({
        ...library,
        notes: library.notes.map((item) =>
          item.id === noteId && item.reminderAt === reminderAt
            ? { ...item, reminderNotifiedAt: deliveredAt }
            : item,
        ),
      }));
      toast(
        note.locked
          ? "Reminder for a locked note"
          : `Reminder: ${note.title || "New Note"}`,
      );
    },
    [toast],
  );
  useEffect(() => {
    const stopReminder = window.desktop?.onReminder?.(receiveReminder);
    const stopOpen = window.desktop?.onOpenNote?.((noteId) => {
      if (
        !latest.current.library.notes.some(
          (note) => note.id === noteId && !note.deletedAt,
        )
      )
        return;
      setScope("all");
      setQuery("");
      setTagFilter("");
      setSelected(noteId);
      setModal(null);
    });
    return () => {
      stopReminder?.();
      stopOpen?.();
    };
  }, [receiveReminder]);
  useEffect(() => {
    if (window.desktop || !loaded) return;
    let timer;
    const check = () => {
      const now = Date.now();
      const pending = latest.current.library.notes.filter(
        (note) =>
          !note.deletedAt &&
          isReminderTimestamp(note.reminderAt) &&
          !(note.reminderNotifiedAt >= note.reminderAt),
      );
      for (const note of pending.filter((item) => item.reminderAt <= now)) {
        receiveReminder({
          noteId: note.id,
          reminderAt: note.reminderAt,
          deliveredAt: now,
        });
      }
      const future = pending.filter((note) => note.reminderAt > now);
      if (future.length)
        timer = setTimeout(
          check,
          Math.min(
            60000,
            Math.max(
              1,
              Math.min(...future.map((note) => note.reminderAt)) - now,
            ),
          ),
        );
    };
    check();
    return () => clearTimeout(timer);
  }, [library.notes, loaded, receiveReminder]);
  useEffect(() => {
    let canceled = false;
    loadLibrary()
      .then((data) => {
        if (canceled) return;
        if (data) {
          setLibrary(data);
          setSelected(data.notes.find((n) => !n.deletedAt)?.id || null);
        }
        setLoaded(true);
      })
      .catch((error) => {
        setLoadError(error.message);
      });
    return () => {
      canceled = true;
    };
  }, []);
  useEffect(() => {
    if (!loaded) return;
    dirty.current = true;
    setSaveStatus("saving");
    const generation = ++saveGeneration.current;
    const timer = setTimeout(() => {
      saveQueue = saveQueue
        .catch(() => {})
        .then(async () => {
          const snapshot = await materialize(library, unlocked);
          await saveLibrary(snapshot);
          if (generation === saveGeneration.current) {
            dirty.current = false;
            setSaveStatus("saved");
          }
        })
        .catch((error) => {
          setSaveStatus("error");
          toast("Could not save: " + error.message);
        });
    }, 300);
    return () => clearTimeout(timer);
  }, [library, unlocked, loaded]);
  useEffect(
    () =>
      window.desktop?.onBeforeClose(async () => {
        if (!latest.current.loaded) {
          window.desktop.finishClose();
          return;
        }
        try {
          await saveQueue;
          await saveLibrary(
            await materialize(latest.current.library, latest.current.unlocked),
          );
          dirty.current = false;
          window.desktop.finishClose();
        } catch (e) {
          toast("Could not save before closing: " + e.message);
        }
      }),
    [],
  );
  useEffect(() => {
    const prevent = (e) => {
      if (dirty.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, []);
  useEffect(() => {
    const mode = library.settings.theme;
    const media = matchMedia("(prefers-color-scheme: dark)");
    const apply = () =>
      (document.documentElement.dataset.theme =
        mode === "system" ? (media.matches ? "dark" : "light") : mode);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [library.settings.theme]);
  useEffect(() => {
    if (!editor) return;
    const change = () => setSelectionTick((x) => x + 1);
    editor.on("selectionUpdate", change);
    editor.on("transaction", change);
    return () => {
      editor.off("selectionUpdate", change);
      editor.off("transaction", change);
    };
  }, [editor]);
  const settings = library.settings;
  const setSettings = (patch) =>
    setLibrary((l) => ({ ...l, settings: { ...l.settings, ...patch } }));
  const notes = useMemo(
    () =>
      library.notes.map((n) =>
        unlocked[n.id]
          ? { ...n, content: unlocked[n.id].content, tags: unlocked[n.id].tags }
          : n,
      ),
    [library.notes, unlocked],
  );
  const current = notes.find((n) => n.id === selected);
  const isLocked = !!current?.locked && !unlocked[current.id];
  const folder = library.folders.find((f) => f.id === scope);
  const scopeName =
    scope === "all"
      ? "All Notes"
      : scope === "deleted"
        ? "Recently Deleted"
        : scope === "pinned"
          ? "Pinned Notes"
          : folder?.name || "Notes";
  const tags = [
    ...new Set(notes.filter((n) => !n.deletedAt).flatMap((n) => n.tags)),
  ].sort();
  const visible = useMemo(() => {
    const ids = descendants(library.folders, scope);
    return notes
      .filter((n) => {
        if (scope === "deleted" ? !n.deletedAt : n.deletedAt) return false;
        if (scope === "pinned" && !n.pinned) return false;
        if (
          folder?.smartTag
            ? !n.tags.includes(folder.smartTag)
            : folder && !ids.has(n.folderId)
        )
          return false;
        if (tagFilter && !n.tags.includes(tagFilter)) return false;
        return (
          !query ||
          [n.title, plainText(n.content), ...n.tags]
            .join(" ")
            .toLowerCase()
            .includes(query.toLowerCase())
        );
      })
      .sort(
        (a, b) =>
          Number(b.pinned) - Number(a.pinned) ||
          (settings.sort === "title"
            ? a.title.localeCompare(b.title)
            : settings.sort === "created"
              ? b.createdAt - a.createdAt
              : b.updatedAt - a.updatedAt),
      );
  }, [notes, scope, query, tagFilter, settings.sort, library.folders]);
  const wordCount = plainText(current?.content)
    .split(/\s+/)
    .filter(Boolean).length;
  function updateNote(id, patch) {
    const n = latest.current.library.notes.find((n) => n.id === id);
    if (!n) return;
    const metadata = { ...patch };
    if (n.locked && ("content" in patch || "tags" in patch)) {
      setUnlocked((u) =>
        u[id]
          ? {
              ...u,
              [id]: {
                ...u[id],
                ...("content" in patch ? { content: patch.content } : {}),
                ...("tags" in patch ? { tags: patch.tags } : {}),
              },
            }
          : u,
      );
      delete metadata.content;
      delete metadata.tags;
    }
    setLibrary((l) => ({
      ...l,
      notes: l.notes.map((n) =>
        n.id === id ? { ...n, ...metadata, updatedAt: Date.now() } : n,
      ),
    }));
  }
  function navigate(nextScope, tag = "") {
    if (matchMedia("(max-width: 820px)").matches) setSidebar(false);
    setScope(nextScope);
    setTagFilter(tag);
    setQuery("");
    setMenu(null);
    const f = library.folders.find((f) => f.id === nextScope),
      ids = descendants(library.folders, nextScope);
    const first = notes
      .filter((n) => (nextScope === "deleted" ? n.deletedAt : !n.deletedAt))
      .filter((n) =>
        nextScope === "pinned"
          ? n.pinned
          : f?.smartTag
            ? n.tags.includes(f.smartTag)
            : f
              ? ids.has(n.folderId)
              : true,
      )
      .find((n) => !tag || n.tags.includes(tag));
    setSelected(first?.id || null);
  }
  function createNote() {
    const id = uid(),
      now = Date.now(),
      target = folder && !folder.smartTag ? folder.id : "notes";
    setLibrary((l) => ({
      ...l,
      notes: [
        {
          id,
          title: "",
          content: "<p></p>",
          tags: tagFilter
            ? [tagFilter]
            : folder?.smartTag
              ? [folder.smartTag]
              : [],
          folderId: target,
          pinned: false,
          locked: false,
          reminderAt: null,
          reminderNotifiedAt: null,
          deletedAt: null,
          createdAt: now,
          updatedAt: now,
        },
        ...l.notes,
      ],
    }));
    if (scope === "deleted" || scope === "pinned") setScope("all");
    setQuery("");
    setSelected(id);
    setMenu(null);
    setTimeout(() => document.querySelector(".note-title")?.focus(), 50);
  }
  function trashNote(note = current) {
    if (!note) return;
    updateNote(note.id, { deletedAt: Date.now() });
    const next = visible.find((n) => n.id !== note.id);
    setSelected(next?.id || null);
    setMenu(null);
    toast("Note moved to Recently Deleted.");
  }
  function openNote(id) {
    const note = notes.find((n) => n.id === id && !n.deletedAt);
    if (!note) return toast("This linked note is no longer available.");
    setScope("all");
    setQuery("");
    setTagFilter("");
    setSelected(id);
    setModal(null);
  }
  function action(callback) {
    callback();
    setMenu(null);
  }
  function insert(content) {
    if (!editor || isLocked) return;
    editor.chain().focus().insertContent(content).run();
    setMenu(null);
  }
  function appendToNote(content) {
    if (!editor || isLocked) return;
    editor
      .chain()
      .focus()
      .insertContentAt(editor.state.doc.content.size, content)
      .run();
    setMenu(null);
  }
  async function exportBackup() {
    try {
      await saveQueue;
      const snapshot = await materialize(
        latest.current.library,
        latest.current.unlocked,
      );
      if (
        await download(
          `Notes-backup-${new Date().toISOString().slice(0, 10)}.json`,
          JSON.stringify(snapshot, null, 2),
          "application/json",
        )
      )
        toast("Backup exported.");
    } catch (e) {
      toast("Export failed: " + e.message);
    }
  }
  async function importBackup(file) {
    if (!file) return;
    if (file.size > 150 * 1024 * 1024)
      return toast("Backups must be smaller than 150 MB.");
    try {
      const data = validateLibrary(JSON.parse(await file.text()));
      setModal({ type: "import", data });
    } catch (e) {
      toast("Could not import: " + e.message);
    }
  }
  async function importAttachment(file, image) {
    if (!file || !editor) return;
    if (file.size > 15 * 1024 * 1024)
      return toast("Please choose an attachment under 15 MB.");
    try {
      const url = await fileDataURL(file);
      if (image) insert({ type: "image", attrs: { src: url, alt: file.name } });
      else
        insert([
          {
            type: "attachment",
            attrs: {
              href: url,
              name: file.name,
              size:
                file.size < 1024 * 1024
                  ? Math.ceil(file.size / 1024) + " KB"
                  : (file.size / 1024 / 1024).toFixed(1) + " MB",
            },
          },
          { type: "paragraph" },
        ]);
    } catch (e) {
      toast("Could not attach file: " + e.message);
    }
  }
  async function lockAgain() {
    const id = current.id;
    const u = unlocked[id];
    if (!u) return;
    const encrypted = await encryptNote(
      { content: u.content, tags: u.tags },
      u.password,
    );
    setLibrary((l) => ({
      ...l,
      notes: l.notes.map((n) => (n.id === id ? { ...n, encrypted } : n)),
    }));
    setUnlocked((x) => {
      const next = { ...x };
      delete next[id];
      return next;
    });
    setMenu(null);
  }
  const createRef = useRef(createNote);
  createRef.current = createNote;
  useEffect(() => {
    const command = (action) => {
      if (action === "new") createRef.current();
      if (action === "search") focusSearch();
    };
    const off = window.desktop?.onShortcut(command);
    const handle = (e) => {
      if (e.key === "Escape") {
        setMenu(null);
        setFind("");
      }
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key.toLowerCase() === "n" && !window.desktop) {
        e.preventDefault();
        command("new");
      }
      if (e.key.toLowerCase() === "f" && e.shiftKey) {
        e.preventDefault();
        focusSearch();
      }
      if (e.key === ",") {
        e.preventDefault();
        setModal({ type: "settings" });
      }
    };
    document.addEventListener("keydown", handle);
    return () => {
      off?.();
      document.removeEventListener("keydown", handle);
    };
  }, []);
  const format = (command, options) =>
    action(() => editor?.chain().focus()[command](options).run());
  function renderFolders(parent = null, depth = 0) {
    return library.folders
      .filter((f) => (f.parentId || null) === parent)
      .map((f) => {
        const children = library.folders.some((c) => c.parentId === f.id),
          open = expanded.has(f.id),
          count = notes.filter(
            (n) =>
              !n.deletedAt &&
              (f.smartTag ? n.tags.includes(f.smartTag) : n.folderId === f.id),
          ).length;
        return (
          <React.Fragment key={f.id}>
            <div
              className={`folder-row ${scope === f.id ? "selected" : ""}`}
              style={{ "--depth": depth }}
              onDragOver={(e) => {
                if (!f.smartTag) e.preventDefault();
              }}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData("note-id");
                if (id && !f.smartTag) {
                  updateNote(id, { folderId: f.id });
                  toast("Note moved to " + f.name);
                }
              }}
            >
              <button
                className={`folder-chevron ${children ? "" : "invisible"}`}
                aria-label={(open ? "Collapse " : "Expand ") + f.name}
                onClick={() =>
                  setExpanded((e) => {
                    const next = new Set(e);
                    next.has(f.id) ? next.delete(f.id) : next.add(f.id);
                    return next;
                  })
                }
              >
                {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              </button>
              <button className="folder-main" onClick={() => navigate(f.id)}>
                {f.smartTag ? (
                  <Settings size={18} strokeWidth={1.5} />
                ) : (
                  <Folder size={18} strokeWidth={1.5} />
                )}
                <span>{f.name}</span>
                <small>{count || ""}</small>
              </button>
              <button
                className="folder-more"
                aria-label={"Options for " + f.name}
                onClick={() => setModal({ type: "folder", folder: f })}
              >
                <MoreHorizontal size={15} />
              </button>
            </div>
            {children && open && renderFolders(f.id, depth + 1)}
          </React.Fragment>
        );
      });
  }
  if (loadError)
    return (
      <div className="boot-screen">
        <ShieldCheck size={45} />
        <h1>Your notes are safe where they are.</h1>
        <p>{loadError}</p>
        <p>The app has not overwritten your existing data.</p>
        <button className="button primary" onClick={() => location.reload()}>
          Try again
        </button>
      </div>
    );
  if (!loaded)
    return (
      <div className="boot-screen">
        <NotebookPen size={45} />
        <LoaderCircle className="spin" size={22} />
        <p>Opening your notebook…</p>
      </div>
    );

  return (
    <div
      className={`app ${sidebar ? "" : "sidebar-hidden"} ${settings.view === "gallery" ? "gallery-view" : ""}`}
      style={{
        "--ui-scale": settings.uiScale || 1,
        "--font-ui": getFontStack(settings.fontFamily),
        "--font-note": getFontStack(
          settings.noteFontFamily === "inherit" || !settings.noteFontFamily
            ? settings.fontFamily
            : settings.noteFontFamily,
        ),
      }}
    >
      <header className="titlebar">
        <div className="app-identity">
          <div className="app-mark">
            <NotebookPen size={15} />
          </div>
          <span>Notes</span>
        </div>
        <div className="titlebar-center">A little space for everything.</div>
        {window.desktop ? (
          <div className="window-controls">
            <button
              aria-label="Minimize"
              onClick={() => window.desktop.minimize()}
            >
              <Minus size={15} />
            </button>
            <button
              aria-label="Maximize"
              onClick={() => window.desktop.maximize()}
            >
              <Square size={12} />
            </button>
            <button
              aria-label="Close app"
              className="window-close"
              onClick={async () => {
                try {
                  await saveQueue;
                  await saveLibrary(
                    await materialize(
                      latest.current.library,
                      latest.current.unlocked,
                    ),
                  );
                  dirty.current = false;
                  window.desktop.close();
                } catch (e) {
                  toast("Could not save before closing: " + e.message);
                }
              }}
            >
              <X size={17} />
            </button>
          </div>
        ) : (
          <div className="local-badge">
            <span /> On this device
          </div>
        )}
      </header>
      {sidebar && (
        <button
          className="sidebar-scrim"
          aria-label="Close folders"
          onClick={() => setSidebar(false)}
        />
      )}
      <aside className="sidebar">
        <div className="sidebar-top">
          <span>Your notebook</span>
          <IconButton
            icon={PanelLeft}
            label="Hide sidebar"
            onClick={() => setSidebar(false)}
          />
        </div>
        <div className="search-field">
          <Search size={15} />
          <input
            ref={searchRef}
            placeholder="Search all notes"
            value={query}
            aria-label="Search all notes"
            onChange={(e) => {
              setQuery(e.target.value);
              if (e.target.value) {
                setScope("all");
                setTagFilter("");
              }
            }}
          />
          {query ? (
            <button aria-label="Clear search" onClick={() => setQuery("")}>
              <X size={13} />
            </button>
          ) : (
            <kbd>Ctrl ⇧ F</kbd>
          )}
        </div>
        <div className="sidebar-content">
          <nav className="sidebar-nav" aria-label="Notes navigation">
            <button
              className={`nav-row ${scope === "all" && !tagFilter ? "selected" : ""}`}
              onClick={() => navigate("all")}
            >
              <FolderOpen size={18} />
              <span>All Notes</span>
              <small>{notes.filter((n) => !n.deletedAt).length}</small>
            </button>
            <button
              className={`nav-row ${scope === "pinned" ? "selected" : ""}`}
              onClick={() => navigate("pinned")}
            >
              <Pin size={17} />
              <span>Pinned</span>
              <small>
                {notes.filter((n) => n.pinned && !n.deletedAt).length}
              </small>
            </button>
            <div className="sidebar-section-title">
              <span>On My PC</span>
              <button
                title="New folder"
                aria-label="New folder"
                onClick={() => setModal({ type: "folder" })}
              >
                <Plus size={15} />
              </button>
            </div>
            <div className="folder-tree">{renderFolders()}</div>
            <button
              className={`nav-row deleted-row ${scope === "deleted" ? "selected" : ""}`}
              onClick={() => navigate("deleted")}
            >
              <Trash2 size={17} />
              <span>Recently Deleted</span>
              <small>{notes.filter((n) => n.deletedAt).length || ""}</small>
            </button>
          </nav>
          <div className="tags-section">
            <div className="sidebar-section-title">
              <span>Tags</span>
              <button
                title="Manage note tags"
                aria-label="Manage note tags"
                disabled={!current || isLocked || !!current.deletedAt}
                onClick={() => setModal({ type: "tags" })}
              >
                <Plus size={15} />
              </button>
            </div>
            <div className="tag-cloud">
              <button
                className={!tagFilter ? "tag selected" : "tag"}
                onClick={() => navigate("all")}
              >
                All Tags
              </button>
              {tags.map((tag) => (
                <button
                  key={tag}
                  className={`tag ${tagFilter === tag ? "selected" : ""}`}
                  onClick={() => navigate("all", tag)}
                >
                  # {tag}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="sidebar-bottom">
          <button
            className="new-folder"
            onClick={() => setModal({ type: "folder" })}
          >
            <FolderPlus size={18} /> New Folder
          </button>
          <IconButton
            icon={Settings}
            label="Settings"
            onClick={() => setModal({ type: "settings" })}
          />
        </div>
        <div className="device-status">
          <span className="status-dot" /> Stored on this device{" "}
          <ShieldCheck size={12} />
        </div>
      </aside>
      <section className="notes-panel" aria-label="Notes list">
        <div className="list-toolbar">
          <IconButton
            className="compact-navigation-toggle"
            icon={PanelLeft}
            label={sidebar ? "Hide folders" : "Show folders"}
            onClick={() => setSidebar((value) => !value)}
          />
          {!sidebar && (
            <IconButton
              className="desktop-navigation-toggle"
              icon={PanelLeft}
              label="Show sidebar"
              onClick={() => setSidebar(true)}
            />
          )}
          <div className="view-toggle">
            <IconButton
              icon={List}
              label="List view"
              active={settings.view === "list"}
              onClick={() => setSettings({ view: "list" })}
            />
            <IconButton
              icon={LayoutGrid}
              label="Gallery view"
              active={settings.view === "gallery"}
              onClick={() => setSettings({ view: "gallery" })}
            />
          </div>
          <div className="toolbar-spacer" />
          <div className="menu-anchor">
            <IconButton
              icon={ArrowDownWideNarrow}
              label="Sort notes"
              onClick={() => setMenu(menu === "sort" ? null : "sort")}
              active={menu === "sort"}
            />
            {menu === "sort" && (
              <div className="dropdown">
                <div className="menu-label">SORT NOTES BY</div>
                {[
                  ["updated", "Date edited"],
                  ["created", "Date created"],
                  ["title", "Title"],
                ].map(([key, label]) => (
                  <MenuItem
                    key={key}
                    icon={settings.sort === key ? Check : Circle}
                    onClick={() => action(() => setSettings({ sort: key }))}
                  >
                    {label}
                  </MenuItem>
                ))}
              </div>
            )}
          </div>
          <IconButton
            icon={SquarePen}
            label="New note (Ctrl+N)"
            onClick={createNote}
          />
        </div>
        <div className="list-heading">
          <h1>
            {query ? "Search Results" : tagFilter ? "#" + tagFilter : scopeName}
          </h1>
          <div>
            <span>
              {visible.length} {visible.length === 1 ? "note" : "notes"}
            </span>
            {query && <span className="query-label">for “{query}”</span>}
            {scope === "deleted" && visible.length > 0 && (
              <button
                className="text-button"
                onClick={() => setModal({ type: "emptyTrash" })}
              >
                Empty
              </button>
            )}
          </div>
        </div>
        {!sidebar && (
          <div className="collapsed-search search-field">
            <Search size={15} />
            <input
              aria-label="Search notes"
              placeholder="Search notes"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        )}
        <div className="notes-scroll">
          {visible.length ? (
            <div className="note-cards">
              {visible.map((n, i) => (
                <React.Fragment key={n.id}>
                  {(i === 0 || visible[i - 1].pinned !== n.pinned) && (
                    <div className="note-group-label">
                      <span>
                        {n.pinned && <Pin size={12} />}
                        {n.pinned
                          ? "Pinned"
                          : query
                            ? "Matching notes"
                            : "Notes"}
                      </span>
                      <small>
                        {
                          visible.filter((note) => !!note.pinned === !!n.pinned)
                            .length
                        }
                      </small>
                    </div>
                  )}
                  <button
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData("note-id", n.id)}
                    className={`note-card ${selected === n.id ? "selected" : ""}`}
                    aria-pressed={selected === n.id}
                    title={n.title || "New Note"}
                    onClick={() => {
                      setSelected(n.id);
                      setFind("");
                    }}
                  >
                    <div className="note-card-heading">
                      {n.locked && <LockKeyhole size={13} />}
                      {!!n.reminderAt && (
                        <Bell size={13} aria-label="Has reminder" />
                      )}
                      <strong>{n.title || "New Note"}</strong>
                    </div>
                    <div className="note-card-preview">
                      <span>
                        {n.locked && !unlocked[n.id]
                          ? "Locked note"
                          : plainText(n.content).slice(0, 180) ||
                            "No additional text"}
                      </span>
                    </div>
                    <div className="note-card-footer">
                      <span
                        className="note-card-folder"
                        title={
                          library.folders.find((f) => f.id === n.folderId)
                            ?.name || "Notes"
                        }
                      >
                        <Folder size={11} />
                        <span>
                          {library.folders.find((f) => f.id === n.folderId)
                            ?.name || "Notes"}
                        </span>
                      </span>
                      {n.tags.length > 0 && (
                        <span className="card-tag" title={"#" + n.tags[0]}>
                          #{n.tags[0]}
                        </span>
                      )}
                      {n.content.includes("<audio") && (
                        <Mic size={12} aria-label="Contains audio" />
                      )}
                      {n.content.includes("<img") && (
                        <ImagePlus size={12} aria-label="Contains images" />
                      )}
                      <time
                        dateTime={new Date(n.updatedAt).toJSON() || undefined}
                        title={fullDate(n.updatedAt)}
                      >
                        {shortDate(n.updatedAt)}
                      </time>
                    </div>
                  </button>
                </React.Fragment>
              ))}
            </div>
          ) : (
            <div className="list-empty">
              <Search size={30} />
              <h3>
                {query ? "No notes found" : "A little room for something new"}
              </h3>
              <p>
                {query
                  ? "Try a different word or search by title."
                  : scope === "deleted"
                    ? "Your deleted notes will appear here."
                    : "Your next idea can start right here."}
              </p>
              {!query && scope !== "deleted" && (
                <button className="text-button" onClick={createNote}>
                  Create a note <ArrowRight size={14} />
                </button>
              )}
            </div>
          )}
        </div>
        <div
          className={`list-bottom ${saveStatus === "error" ? "has-error" : ""}`}
        >
          <span>
            {scope === "deleted"
              ? "Deleted notes stay until you remove them"
              : `${visible.length} ${visible.length === 1 ? "note" : "notes"}`}
          </span>
          {scope !== "deleted" && (
            <span className="list-save-status">
              {saveStatus === "saving" ? (
                <LoaderCircle size={12} className="spin" />
              ) : saveStatus === "error" ? (
                <Info size={12} />
              ) : (
                <ShieldCheck size={12} />
              )}
              {saveStatus === "saving"
                ? "Saving…"
                : saveStatus === "error"
                  ? "Not saved"
                  : "Saved locally"}
            </span>
          )}
        </div>
      </section>
      <main className="editor-panel">
        <div className="editor-toolbar">
          <div className="toolbar-cluster">
            <IconButton
              icon={Trash2}
              label="Delete note"
              onClick={() =>
                current?.deletedAt
                  ? setModal({ type: "deleteNote" })
                  : trashNote()
              }
              disabled={!current}
            />
            <div className="toolbar-divider" />
            <div className="menu-anchor">
              <button
                className={`format-button ${menu === "format" ? "active" : ""}`}
                title="Text style"
                aria-label="Text style"
                disabled={!current || isLocked || !!current.deletedAt}
                onClick={() => setMenu(menu === "format" ? null : "format")}
              >
                Aa <ChevronDown size={12} />
              </button>
              {menu === "format" && (
                <div className="dropdown format-menu">
                  <div className="menu-label">MAKE IT YOURS</div>
                  <MenuItem
                    icon={Heading1}
                    onClick={() => format("toggleHeading", { level: 1 })}
                  >
                    Title
                  </MenuItem>
                  <MenuItem
                    icon={Heading2}
                    onClick={() => format("toggleHeading", { level: 2 })}
                  >
                    Heading
                  </MenuItem>
                  <MenuItem icon={Type} onClick={() => format("setParagraph")}>
                    Body
                  </MenuItem>
                  <div className="format-controls">
                    {[
                      [Bold, "toggleBold", "Bold"],
                      [Italic, "toggleItalic", "Italic"],
                      [Underline, "toggleUnderline", "Underline"],
                      [Strikethrough, "toggleStrike", "Strikethrough"],
                      [Highlighter, "toggleHighlight", "Highlight"],
                    ].map(([Icon, command, label]) => (
                      <IconButton
                        key={command}
                        icon={Icon}
                        label={label}
                        active={editor?.isActive(label.toLowerCase())}
                        onClick={() => format(command)}
                      />
                    ))}
                  </div>
                  <div className="menu-separator" />
                  <MenuItem
                    icon={List}
                    onClick={() => format("toggleBulletList")}
                  >
                    Bulleted list
                  </MenuItem>
                  <MenuItem
                    icon={ListOrdered}
                    onClick={() => format("toggleOrderedList")}
                  >
                    Numbered list
                  </MenuItem>
                  <MenuItem
                    icon={Quote}
                    onClick={() => format("toggleBlockquote")}
                  >
                    Block quote
                  </MenuItem>
                  <MenuItem
                    icon={Code2}
                    onClick={() => format("toggleCodeBlock")}
                  >
                    Code block
                  </MenuItem>
                  <MenuItem
                    icon={ChevronRight}
                    onClick={() =>
                      action(() =>
                        insert(
                          '<div data-type="details" open><summary>Section title</summary><div data-type="detailsContent"><p>Add something here…</p></div></div>',
                        ),
                      )
                    }
                  >
                    Collapsible section
                  </MenuItem>
                </div>
              )}
            </div>
            <IconButton
              icon={CheckCheck}
              label="Checklist"
              onClick={() => editor?.chain().focus().toggleTaskList().run()}
              active={editor?.isActive("taskList")}
              disabled={!current || isLocked || !!current.deletedAt}
            />
            <IconButton
              icon={Mic}
              label="Record or import audio"
              onClick={() =>
                action(() => setModal({ type: "audio", noteId: current.id }))
              }
              disabled={!current || isLocked || !!current.deletedAt}
            />
            <IconButton
              icon={Bell}
              label="Set reminder"
              active={!!current?.reminderAt}
              onClick={() => action(() => setModal({ type: "reminder" }))}
              disabled={!current || isLocked || !!current.deletedAt}
            />
            <div className="menu-anchor">
              <IconButton
                icon={Table2}
                label="Insert or edit table"
                onClick={() =>
                  editor?.isActive("table")
                    ? setMenu(menu === "table" ? null : "table")
                    : editor
                        ?.chain()
                        .focus()
                        .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
                        .run()
                }
                disabled={!current || isLocked || !!current.deletedAt}
              />
              {menu === "table" && (
                <div className="dropdown">
                  {[
                    ["Add row below", "addRowAfter"],
                    ["Add column after", "addColumnAfter"],
                    ["Delete row", "deleteRow"],
                    ["Delete column", "deleteColumn"],
                    ["Delete table", "deleteTable"],
                  ].map(([label, command]) => (
                    <MenuItem key={command} onClick={() => format(command)}>
                      {label}
                    </MenuItem>
                  ))}
                </div>
              )}
            </div>
            <div className="menu-anchor">
              <IconButton
                icon={Paperclip}
                label="Add to note"
                active={menu === "insert"}
                disabled={!current || isLocked || !!current.deletedAt}
                onClick={() => setMenu(menu === "insert" ? null : "insert")}
              />
              {menu === "insert" && (
                <div className="dropdown">
                  <div className="menu-label">ADD A LITTLE MORE</div>
                  <MenuItem
                    icon={ImagePlus}
                    onClick={() => action(() => imageInput.current.click())}
                  >
                    Photo or image
                  </MenuItem>
                  <MenuItem
                    icon={Paperclip}
                    onClick={() =>
                      action(() => attachmentInput.current.click())
                    }
                  >
                    Attach a file
                  </MenuItem>
                  <MenuItem
                    icon={Mic}
                    onClick={() =>
                      action(() =>
                        setModal({ type: "audio", noteId: current.id }),
                      )
                    }
                  >
                    Record or transcribe audio
                  </MenuItem>
                  <MenuItem
                    icon={CircleHelp}
                    disabled={!current.content.includes("<audio")}
                    onClick={() =>
                      action(() => {
                        const context = audioContextFromNote(current.content);
                        setModal(
                          context.transcript || !context.audioSrc
                            ? { type: "audioQuestions", ...context }
                            : {
                                type: "audio",
                                initialAudioSrc: context.audioSrc,
                              },
                        );
                      })
                    }
                  >
                    Ask about audio
                  </MenuItem>
                  <MenuItem
                    icon={ScanLine}
                    onClick={() =>
                      action(() =>
                        setModal({ type: "scan", noteId: current.id }),
                      )
                    }
                  >
                    Scan document & recognize text
                  </MenuItem>
                  <div className="menu-separator" />
                  <MenuItem
                    icon={Calculator}
                    onClick={() => action(() => setModal({ type: "math" }))}
                  >
                    Math & equations
                  </MenuItem>
                  <MenuItem
                    icon={Link2}
                    onClick={() => action(() => setModal({ type: "link" }))}
                  >
                    Link to a note or website
                  </MenuItem>
                </div>
              )}
            </div>
          </div>
          <div className="toolbar-spacer" />
          <div className="toolbar-cluster">
            <div className="menu-anchor">
              <IconButton
                icon={
                  current?.locked
                    ? isLocked
                      ? LockKeyhole
                      : LockKeyholeOpen
                    : LockKeyhole
                }
                label={current?.locked ? "Note lock options" : "Lock note"}
                disabled={!current || !!current.deletedAt}
                active={!!current?.locked}
                onClick={() =>
                  current?.locked && !isLocked
                    ? setMenu(menu === "lock" ? null : "lock")
                    : action(() =>
                        setModal({ type: isLocked ? "unlock" : "lock" }),
                      )
                }
              />
              {menu === "lock" && (
                <div className="dropdown right">
                  <MenuItem icon={LockKeyhole} onClick={lockAgain}>
                    Close this locked note
                  </MenuItem>
                  <MenuItem
                    icon={LockKeyholeOpen}
                    onClick={() =>
                      action(() => {
                        const u = unlocked[current.id];
                        setLibrary((l) => ({
                          ...l,
                          notes: l.notes.map((n) =>
                            n.id === current.id
                              ? {
                                  ...n,
                                  locked: false,
                                  encrypted: null,
                                  content: u.content,
                                  tags: u.tags,
                                }
                              : n,
                          ),
                        }));
                        setUnlocked((x) => {
                          const next = { ...x };
                          delete next[current.id];
                          return next;
                        });
                        toast("Lock removed.");
                      })
                    }
                  >
                    Remove lock
                  </MenuItem>
                </div>
              )}
            </div>
            <div className="menu-anchor">
              <IconButton
                icon={Share}
                label="Export note"
                disabled={!current || isLocked}
                onClick={() => setMenu(menu === "export" ? null : "export")}
              />
              {menu === "export" && (
                <div className="dropdown right">
                  <div className="menu-label">TAKE IT WITH YOU</div>
                  <MenuItem
                    icon={FileText}
                    onClick={() =>
                      action(async () => {
                        if (
                          await download(
                            safeName(current.title) + ".txt",
                            current.title + "\n\n" + plainText(current.content),
                          )
                        )
                          toast("Note exported.");
                      })
                    }
                  >
                    Export as plain text
                  </MenuItem>
                  <MenuItem
                    icon={Code2}
                    onClick={() =>
                      action(async () => {
                        if (
                          await download(
                            safeName(current.title) + ".html",
                            `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHTML(current.title)}</title><style>body{max-width:760px;margin:60px auto;font:17px/1.8 system-ui;padding:0 24px}img{max-width:100%}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:8px}audio{display:block}</style></head><body><h1>${escapeHTML(current.title)}</h1>${cleanHTML(current.content)}</body></html>`,
                            "text/html",
                          )
                        )
                          toast("Note exported.");
                      })
                    }
                  >
                    Export as HTML
                  </MenuItem>
                  <MenuItem
                    icon={Share}
                    onClick={() => action(() => window.print())}
                  >
                    Print / Save as PDF
                  </MenuItem>
                  <div className="menu-separator" />
                  <MenuItem
                    icon={Download}
                    onClick={() => action(exportBackup)}
                  >
                    Back up all notes
                  </MenuItem>
                </div>
              )}
            </div>
            <div className="menu-anchor">
              <IconButton
                icon={MoreHorizontal}
                label="More note options"
                disabled={!current}
                active={menu === "more"}
                onClick={() => setMenu(menu === "more" ? null : "more")}
              />
              {menu === "more" && (
                <div className="dropdown right">
                  <MenuItem
                    icon={Pin}
                    disabled={!!current.deletedAt}
                    onClick={() =>
                      action(() =>
                        updateNote(current.id, { pinned: !current.pinned }),
                      )
                    }
                  >
                    {current.pinned ? "Unpin note" : "Pin note"}
                  </MenuItem>
                  <MenuItem
                    icon={Folder}
                    disabled={!!current.deletedAt}
                    onClick={() => action(() => setModal({ type: "move" }))}
                  >
                    Move to folder
                  </MenuItem>
                  <MenuItem
                    icon={Hash}
                    disabled={isLocked || !!current.deletedAt}
                    onClick={() => action(() => setModal({ type: "tags" }))}
                  >
                    Edit tags
                  </MenuItem>
                  <MenuItem
                    icon={Copy}
                    disabled={isLocked || !!current.deletedAt}
                    onClick={() =>
                      action(() => {
                        const id = uid(),
                          now = Date.now();
                        setLibrary((l) => ({
                          ...l,
                          notes: [
                            {
                              ...current,
                              id,
                              title: current.title + " — Copy",
                              locked: false,
                              encrypted: null,
                              reminderAt: null,
                              reminderNotifiedAt: null,
                              createdAt: now,
                              updatedAt: now,
                            },
                            ...l.notes,
                          ],
                        }));
                        setSelected(id);
                        toast("Note duplicated.");
                      })
                    }
                  >
                    Duplicate note
                  </MenuItem>
                  <div className="menu-separator" />
                  <MenuItem
                    icon={Sparkles}
                    disabled={isLocked || !!current.deletedAt}
                    onClick={() => action(() => setModal({ type: "summary" }))}
                  >
                    Quick summary
                  </MenuItem>
                  <MenuItem
                    icon={Info}
                    onClick={() => action(() => setModal({ type: "info" }))}
                  >
                    Note details
                  </MenuItem>
                </div>
              )}
            </div>
          </div>
        </div>
        {current ? (
          <>
            {current.deletedAt && (
              <div className="deleted-banner">
                <Trash2 size={15} />
                <span>This note is in Recently Deleted.</span>
                <button
                  className="text-button"
                  onClick={() => {
                    updateNote(current.id, { deletedAt: null });
                    navigate("all");
                    setSelected(current.id);
                    toast("Note restored.");
                  }}
                >
                  Restore note
                </button>
              </div>
            )}
            {isLocked ? (
              <div className="locked-screen">
                <div className="locked-icon">
                  <LockKeyhole size={30} />
                </div>
                <h1>{current.title || "Locked note"}</h1>
                <p>
                  This note is locked.
                  <br />
                  Enter its password to see what’s inside.
                </p>
                <button
                  className="button primary"
                  onClick={() => setModal({ type: "unlock" })}
                >
                  Unlock note
                </button>
                <small>Its content is encrypted on this device.</small>
              </div>
            ) : (
              <>
                <div className="editor-scroll">
                  <article
                    className={`note-document ${current.deletedAt ? "read-only" : ""}`}
                  >
                    <div className="note-date">
                      {fullDate(current.updatedAt)}
                      {current.pinned && (
                        <>
                          <span className="date-dot">·</span>
                          <Pin size={11} />
                          <span>Pinned</span>
                        </>
                      )}
                    </div>
                    <input
                      className="note-title"
                      value={current.title}
                      onChange={(e) =>
                        updateNote(current.id, { title: e.target.value })
                      }
                      placeholder="New Note"
                      aria-label="Note title"
                      readOnly={!!current.deletedAt}
                    />
                    {!!current.reminderAt && !current.deletedAt && (
                      <button
                        className="reminder-banner"
                        aria-label="Edit reminder"
                        onClick={() => setModal({ type: "reminder" })}
                      >
                        <Bell size={15} />
                        <span>
                          {current.reminderNotifiedAt ? "Reminded" : "Reminder"}{" "}
                          · {formatReminder(current.reminderAt)}
                        </span>
                      </button>
                    )}
                    <NoteEditor
                      key={current.id + (isLocked ? "-locked" : "")}
                      note={current}
                      onChange={(content) =>
                        updateNote(current.id, { content })
                      }
                      onReady={setEditor}
                      onNoteLink={openNote}
                      onLinkRequest={() => setModal({ type: "link" })}
                      fontSize={settings.fontSize}
                    />
                  </article>
                </div>
                <div className="note-tags-bar">
                  <div
                    className="note-tags"
                    role="group"
                    aria-label="Note tags"
                  >
                    {current.tags.map((tag) => (
                      <button
                        key={tag}
                        disabled={!!current.deletedAt}
                        onClick={() => navigate("all", tag)}
                      >
                        # {tag}
                      </button>
                    ))}
                    {!current.deletedAt && (
                      <button
                        className="add-tag"
                        aria-label="Edit note tags"
                        onClick={() => setModal({ type: "tags" })}
                      >
                        <Plus size={12} />
                        {current.tags.length ? "Tag" : "Add a tag"}
                      </button>
                    )}
                  </div>
                </div>
              </>
            )}
            <footer className="editor-footer">
              <span className={"save-state " + saveStatus}>
                {saveStatus === "saving" ? (
                  <LoaderCircle size={12} className="spin" />
                ) : saveStatus === "error" ? (
                  <Info size={12} />
                ) : (
                  <Check size={12} />
                )}{" "}
                {saveStatus === "saving"
                  ? "Saving…"
                  : saveStatus === "error"
                    ? "Not saved — export a backup"
                    : "All changes saved"}
              </span>
              <span>
                {isLocked
                  ? "Encrypted note"
                  : wordCount + (wordCount === 1 ? " word" : " words")}
                <span className="footer-dot">·</span>
                <button
                  onClick={() => setModal({ type: "shortcuts" })}
                  aria-label="Keyboard shortcuts"
                >
                  <Keyboard size={14} />
                </button>
              </span>
            </footer>
          </>
        ) : (
          <div className="editor-empty">
            <div className="empty-notebook">
              <NotebookPen size={48} strokeWidth={1} />
            </div>
            <h2>A thought worth keeping.</h2>
            <p>Select a note, or start a new one.</p>
            <button className="button primary" onClick={createNote}>
              <Plus size={16} /> New Note
            </button>
            <span>Ctrl + N</span>
          </div>
        )}
      </main>
      <input
        hidden
        type="file"
        accept="image/*"
        ref={imageInput}
        onChange={(e) => {
          importAttachment(e.target.files[0], true);
          e.target.value = "";
        }}
      />
      <input
        hidden
        type="file"
        ref={attachmentInput}
        onChange={(e) => {
          importAttachment(e.target.files[0], false);
          e.target.value = "";
        }}
      />
      <input
        hidden
        type="file"
        accept="application/json,.json"
        ref={backupInput}
        onChange={(e) => {
          importBackup(e.target.files[0]);
          e.target.value = "";
        }}
      />
      {menu && <div className="menu-scrim" onClick={() => setMenu(null)} />}
      {toastMessage && (
        <div className="toast" role="status">
          <Check size={16} />
          {toastMessage}
          <button
            aria-label="Dismiss notification"
            onClick={() => setToastMessage("")}
          >
            <X size={13} />
          </button>
        </div>
      )}
      {modal && (
        <Modal
          close={() => setModal(null)}
          wide={["audio", "audioQuestions", "scan"].includes(modal.type)}
        >
          <DialogContent
            modal={modal}
            close={() => setModal(null)}
            current={current}
            library={library}
            notes={notes}
            unlocked={unlocked}
            setUnlocked={setUnlocked}
            updateNote={updateNote}
            setLibrary={setLibrary}
            setSelected={setSelected}
            setSettings={setSettings}
            setScope={setScope}
            toast={toast}
            insert={insert}
            appendToNote={appendToNote}
            exportBackup={exportBackup}
            backupInput={backupInput}
            openNote={openNote}
          />
        </Modal>
      )}
    </div>
  );
}

function DialogContent({
  modal,
  close,
  current,
  library,
  notes,
  unlocked,
  setUnlocked,
  updateNote,
  setLibrary,
  setSelected,
  setSettings,
  setScope,
  toast,
  insert,
  appendToNote,
  exportBackup,
  backupInput,
  openNote,
}) {
  const [value, setValue] = useState(
      modal.type === "folder"
        ? modal.folder?.name || ""
        : modal.type === "tags"
          ? current?.tags.join(", ") || ""
          : "",
    ),
    [password, setPassword] = useState(""),
    [confirm, setConfirm] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [parent, setParent] = useState(modal.folder?.parentId || ""),
    [smart, setSmart] = useState(!!modal.folder?.smartTag),
    [smartTag, setSmartTag] = useState(modal.folder?.smartTag || ""),
    [result, setResult] = useState(""),
    [audioAnswers, setAudioAnswers] = useState([]);
  const settings = library.settings;
  if (modal.type === "audio")
    return (
      <AudioTool
        insert={appendToNote}
        close={close}
        toast={toast}
        initialAudioSrc={modal.initialAudioSrc}
        initialTranscript={modal.initialTranscript}
      />
    );
  if (modal.type === "reminder")
    return (
      <ReminderDialog
        note={current}
        remindersInTray={settings.remindersInTray}
        close={close}
        onSave={(patch) => {
          updateNote(current.id, patch);
          toast("Reminder saved.");
        }}
        onClear={() => {
          updateNote(current.id, {
            reminderAt: null,
            reminderNotifiedAt: null,
          });
          toast("Reminder removed.");
        }}
      />
    );
  if (modal.type === "audioQuestions")
    return (
      <div className="tool-dialog">
        <div className="dialog-icon">
          <CircleHelp size={26} />
        </div>
        <h2>Questions about your recording</h2>
        {modal.transcript ? (
          <details className="transcript-reference">
            <summary>View saved transcript</summary>
            <p>{modal.transcript}</p>
          </details>
        ) : (
          <p className="dialog-description">
            Transcribe or import an audio recording first to ask questions about
            it.
          </p>
        )}
        <AudioQuestions
          transcript={modal.transcript}
          onAnswersChange={setAudioAnswers}
          onBusyChange={setBusy}
        />
        <div className="dialog-actions">
          <button className="button" onClick={close}>
            Done
          </button>
          <button
            className="button primary"
            disabled={busy || !audioAnswers.some((answer) => answer.answer)}
            onClick={() => {
              appendToNote(qaAnswersToNodes(audioAnswers));
              close();
            }}
          >
            Add answers to note
          </button>
        </div>
      </div>
    );
  if (modal.type === "scan")
    return <ScanTool insert={insert} close={close} toast={toast} />;
  const submit = (e) => {
    e.preventDefault();
    if (busy) return;
    handleSubmit();
  };
  async function handleSubmit() {
    setError("");
    if (modal.type === "folder") {
      if (!value.trim()) return setError("Give this folder a name.");
      if (smart && !smartTag.trim())
        return setError("Choose a tag for this Smart Folder.");
      const id = modal.folder?.id || uid();
      const folder = {
        id,
        name: value.trim().slice(0, 120),
        parentId: parent || null,
        smartTag: smart
          ? smartTag.replace(/^#/, "").trim().toLowerCase().replace(/\s+/g, "-")
          : undefined,
      };
      setLibrary((l) => ({
        ...l,
        folders: modal.folder
          ? l.folders.map((f) => (f.id === id ? folder : f))
          : [...l.folders, folder],
      }));
      close();
      toast(modal.folder ? "Folder updated." : "Folder created.");
    }
    if (modal.type === "tags") {
      updateNote(current.id, {
        tags: [
          ...new Set(
            value
              .split(",")
              .map((t) =>
                t
                  .trim()
                  .replace(/^#/, "")
                  .toLowerCase()
                  .replace(/\s+/g, "-")
                  .slice(0, 80),
              )
              .filter(Boolean),
          ),
        ],
      });
      close();
    }
    if (modal.type === "lock") {
      if (password.length < 6)
        return setError("Use a password with at least 6 characters.");
      if (password !== confirm) return setError("The passwords don’t match.");
      setBusy(true);
      try {
        const encrypted = await encryptNote(
          { content: current.content, tags: current.tags },
          password,
        );
        setLibrary((l) => ({
          ...l,
          notes: l.notes.map((n) =>
            n.id === current.id
              ? {
                  ...n,
                  locked: true,
                  content: "",
                  tags: [],
                  encrypted,
                  updatedAt: Date.now(),
                }
              : n,
          ),
        }));
        close();
        toast("Note locked. Remember its password.");
      } catch (e) {
        setError(e.message);
      } finally {
        setBusy(false);
      }
    }
    if (modal.type === "unlock") {
      setBusy(true);
      try {
        const payload = await decryptNote(current.encrypted, password);
        setUnlocked((u) => ({ ...u, [current.id]: { ...payload, password } }));
        close();
      } catch {
        setError("That password didn’t unlock this note. Please try again.");
      } finally {
        setBusy(false);
      }
    }
    if (modal.type === "link") {
      const url = value.trim();
      if (!/^https?:\/\//i.test(url) && !/^mailto:/i.test(url))
        return setError("Enter a full https://, http://, or mailto: link.");
      insert(`<p><a href="${escapeHTML(url)}">${escapeHTML(url)}</a></p>`);
      close();
    }
    if (modal.type === "math") {
      if (!value.trim() || value.length > 250)
        return setError("Enter a calculation of up to 250 characters.");
      setBusy(true);
      try {
        const { parse, format } = await import("mathjs");
        const ast = parse(value);
        const functions = new Set([
          "sqrt",
          "abs",
          "round",
          "floor",
          "ceil",
          "sin",
          "cos",
          "tan",
          "log",
          "log10",
          "exp",
          "min",
          "max",
        ]);
        let valid = true;
        ast.traverse((node) => {
          if (
            [
              "AssignmentNode",
              "FunctionAssignmentNode",
              "AccessorNode",
              "BlockNode",
              "ObjectNode",
              "ArrayNode",
              "RangeNode",
              "IndexNode",
              "ConditionalNode",
            ].includes(node.type) ||
            (node.type === "SymbolNode" &&
              !["pi", "e", ...functions].includes(node.name)) ||
            (node.type === "FunctionNode" && !functions.has(node.fn.name)) ||
            (node.type === "OperatorNode" &&
              ["!", "^"].includes(node.op) &&
              node.args.some(
                (a) => a.isConstantNode && Number(a.value) > 10000,
              ))
          )
            valid = false;
        });
        if (!valid)
          throw new Error(
            "Use numbers, arithmetic operators, pi, e, or a supported function such as sqrt().",
          );
        const answer = ast.evaluate();
        const formatted = format(answer, { precision: 12 });
        if (formatted.length > 500) throw new Error("The result is too large.");
        setResult(formatted);
      } catch (e) {
        setError(e.message);
        setResult("");
      } finally {
        setBusy(false);
      }
    }
  }
  const heading = (Icon, title, description) => (
    <>
      <div className="dialog-icon">
        <Icon size={25} />
      </div>
      <h2>{title}</h2>
      {description && <p className="dialog-description">{description}</p>}
    </>
  );
  if (modal.type === "folder")
    return (
      <form className="standard-dialog" onSubmit={submit}>
        {heading(
          smart ? Settings : FolderPlus,
          modal.folder ? "A place for your notes" : "Give your ideas a home",
          "Create a folder, a subfolder, or a collection that organizes itself.",
        )}
        <label className="field-label">
          Folder name
          <input
            value={value}
            maxLength={120}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Something worth collecting"
            autoFocus
          />
        </label>
        <label className="field-label">
          Inside
          <select
            aria-label="Inside"
            value={parent}
            disabled={modal.folder?.id === "notes"}
            onChange={(e) => setParent(e.target.value)}
          >
            <option value="">On My PC</option>
            {library.folders
              .filter(
                (f) =>
                  !f.smartTag &&
                  !descendants(library.folders, modal.folder?.id).has(f.id),
              )
              .map((f) => (
                <option value={f.id} key={f.id}>
                  {f.name}
                </option>
              ))}
          </select>
        </label>
        {modal.folder?.id !== "notes" && (
          <label className="toggle-row">
            <span>
              <strong>Smart Folder</strong>
              <small>Automatically collect notes with a tag</small>
            </span>
            <input
              aria-label="Smart Folder"
              type="checkbox"
              checked={smart}
              onChange={(e) => setSmart(e.target.checked)}
            />
          </label>
        )}
        {smart && (
          <label className="field-label">
            Match tag
            <input
              value={smartTag}
              maxLength={80}
              onChange={(e) => setSmartTag(e.target.value)}
              placeholder="e.g. inspiration"
            />
          </label>
        )}
        {error && <p className="form-error">{error}</p>}
        <div className="dialog-actions">
          {modal.folder && modal.folder.id !== "notes" && (
            <button
              type="button"
              className="button danger"
              onClick={() => {
                const ids = descendants(library.folders, modal.folder.id);
                setLibrary((l) => ({
                  ...l,
                  folders: l.folders.filter((f) => !ids.has(f.id)),
                  notes: l.notes.map((n) =>
                    ids.has(n.folderId) ? { ...n, folderId: "notes" } : n,
                  ),
                }));
                setScope("all");
                close();
                toast("Folder removed. Its notes were moved to Notes.");
              }}
            >
              Delete folder
            </button>
          )}
          <button type="button" className="button" onClick={close}>
            Cancel
          </button>
          <button className="button primary">
            {modal.folder ? "Save changes" : "Create folder"}
          </button>
        </div>
      </form>
    );
  if (modal.type === "tags")
    return (
      <form className="standard-dialog" onSubmit={submit}>
        {heading(
          Hash,
          "Connect a few ideas",
          "Tags bring related notes together, wherever they live.",
        )}
        <label className="field-label">
          Tags, separated by commas
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="personal, inspiration, someday"
            autoFocus
          />
        </label>
        <p className="helper">
          Click a tag in the sidebar to see matching notes, or use it in a Smart
          Folder.
        </p>
        <div className="dialog-actions">
          <button type="button" className="button" onClick={close}>
            Cancel
          </button>
          <button className="button primary">Save tags</button>
        </div>
      </form>
    );
  if (["lock", "unlock"].includes(modal.type))
    return (
      <form className="standard-dialog" onSubmit={submit}>
        {heading(
          LockKeyhole,
          modal.type === "lock"
            ? "Some thoughts are just for you"
            : "Welcome back to this note",
          modal.type === "lock"
            ? "Encrypt this note’s content, attachments, and tags with a password."
            : "Enter this note’s password to unlock it on this device.",
        )}
        <label className="field-label">
          Password
          <input
            type="password"
            autoComplete={
              modal.type === "lock" ? "new-password" : "current-password"
            }
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
          />
        </label>
        {modal.type === "lock" && (
          <>
            <label className="field-label">
              Confirm password
              <input
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </label>
            <p className="helper lock-helper">
              The title stays visible. There is no password recovery; keep a
              safe copy of your password. Notes stay unlocked for this session
              until you close their lock or quit.
            </p>
          </>
        )}
        {error && <p className="form-error">{error}</p>}
        <div className="dialog-actions">
          <button type="button" className="button" onClick={close}>
            Cancel
          </button>
          <button className="button primary" disabled={busy}>
            {busy && <LoaderCircle size={14} className="spin" />}
            {modal.type === "lock" ? "Lock note" : "Unlock note"}
          </button>
        </div>
      </form>
    );
  if (modal.type === "move")
    return (
      <div className="standard-dialog">
        {heading(Folder, "Find the right home", "Move this note to a folder.")}
        <div className="folder-picker">
          {library.folders
            .filter((f) => !f.smartTag)
            .map((f) => (
              <button
                key={f.id}
                onClick={() => {
                  updateNote(current.id, { folderId: f.id });
                  close();
                  toast("Note moved to " + f.name);
                }}
              >
                <Folder size={18} />
                <span>
                  {f.parentId
                    ? library.folders.find((p) => p.id === f.parentId)?.name +
                      " / "
                    : ""}
                  {f.name}
                </span>
                {current.folderId === f.id && <Check size={17} />}
              </button>
            ))}
        </div>
      </div>
    );
  if (modal.type === "link")
    return (
      <form className="standard-dialog" onSubmit={submit}>
        {heading(
          Link2,
          "One idea leads to another",
          "Connect this note to another note or a website.",
        )}
        <label className="field-label">
          Search your notes, or paste a website link
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Search notes or https://…"
            autoFocus
          />
        </label>
        <div className="note-link-picker">
          {notes
            .filter(
              (n) =>
                !n.deletedAt &&
                n.id !== current?.id &&
                n.title.toLowerCase().includes(value.toLowerCase()),
            )
            .map((n) => (
              <button
                type="button"
                key={n.id}
                onClick={() => {
                  insert(
                    `<p><a href="note:${n.id}">${escapeHTML(n.title || "Untitled")}</a></p>`,
                  );
                  close();
                }}
              >
                <FileText size={16} />
                <span>{n.title || "Untitled"}</span>
                <ArrowUpRight size={14} />
              </button>
            ))}
        </div>
        {error && <p className="form-error">{error}</p>}
        <div className="dialog-actions">
          <button className="button" type="button" onClick={close}>
            Cancel
          </button>
          <button className="button primary" disabled={!value.trim()}>
            Add website link
          </button>
        </div>
      </form>
    );
  if (modal.type === "math")
    return (
      <form className="standard-dialog" onSubmit={submit}>
        {heading(
          Calculator,
          "A little help with the numbers",
          "Calculate an expression, then add the result to your note.",
        )}
        <label className="field-label">
          Expression
          <input
            className="math-input"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setResult("");
            }}
            placeholder="(125 + 85) / 3"
            autoFocus
          />
        </label>
        <p className="helper">
          Try +, −, *, /, ^, sqrt(), sin(), cos(), log(), round(), pi, or e.
          Typed expressions only; handwriting and automatic inline solving are
          not included.
        </p>
        {result && (
          <div className="math-result">
            <span>=</span>
            {result}
          </div>
        )}
        {error && <p className="form-error">{error}</p>}
        <div className="dialog-actions">
          <button type="button" className="button" onClick={close}>
            Cancel
          </button>
          {result && (
            <button
              type="button"
              className="button primary"
              onClick={() => {
                insert(
                  `<p><code>${escapeHTML(value)} = ${escapeHTML(result)}</code></p>`,
                );
                close();
              }}
            >
              Add to note
            </button>
          )}
          <button
            className={"button " + (!result ? "primary" : "")}
            disabled={busy}
          >
            {busy ? "Calculating…" : "Calculate"}
          </button>
        </div>
      </form>
    );
  if (modal.type === "summary") {
    const summary = summarize(plainText(current.content));
    return (
      <div className="standard-dialog">
        {heading(
          Sparkles,
          "The ideas at a glance",
          "A local, extractive summary of the sentences in this note.",
        )}
        <div className="summary-content">
          {summary.length ? (
            <ul>
              {summary.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          ) : (
            <p>Add a few complete sentences to create a summary.</p>
          )}
        </div>
        <p className="helper">
          This ranks existing sentences on your device. It does not use Apple
          Intelligence or a generative AI service.
        </p>
        <div className="dialog-actions">
          <button className="button" onClick={close}>
            Close
          </button>
          <button
            className="button primary"
            disabled={!summary.length}
            onClick={() => {
              insert(
                "<h2>Quick summary</h2><ul>" +
                  summary
                    .map((s) => "<li><p>" + escapeHTML(s) + "</p></li>")
                    .join("") +
                  "</ul>",
              );
              close();
            }}
          >
            Add to note
          </button>
        </div>
      </div>
    );
  }
  if (modal.type === "info")
    return (
      <div className="standard-dialog">
        {heading(Info, "A few details", current.title || "Untitled")}
        <dl className="note-details">
          <div>
            <dt>Created</dt>
            <dd>{fullDate(current.createdAt)}</dd>
          </div>
          <div>
            <dt>Last edited</dt>
            <dd>{fullDate(current.updatedAt)}</dd>
          </div>
          <div>
            <dt>Folder</dt>
            <dd>
              {library.folders.find((f) => f.id === current.folderId)?.name ||
                "Notes"}
            </dd>
          </div>
          <div>
            <dt>Words</dt>
            <dd>
              {current.locked && !unlocked[current.id]
                ? "Locked"
                : plainText(current.content).split(/\s+/).filter(Boolean)
                    .length}
            </dd>
          </div>
          <div>
            <dt>Privacy</dt>
            <dd>
              {current.locked
                ? "Password-encrypted content"
                : "Stored locally on this device"}
            </dd>
          </div>
        </dl>
        <div className="dialog-actions">
          <button className="button primary" onClick={close}>
            Done
          </button>
        </div>
      </div>
    );
  if (["emptyTrash", "deleteNote", "import"].includes(modal.type))
    return (
      <div className="standard-dialog">
        {heading(
          modal.type === "import" ? Upload : Trash2,
          modal.type === "import"
            ? "Bring your notebook back"
            : modal.type === "emptyTrash"
              ? "Empty Recently Deleted?"
              : "Delete this note permanently?",
          modal.type === "import"
            ? `This backup contains ${modal.data.notes.length} notes and ${modal.data.folders.length} folders. Importing will replace your current library. Export a backup first if you want to keep it.`
            : "This permanently removes the selected notes from this library. This action cannot be undone.",
        )}
        <div className="dialog-actions">
          <button className="button" onClick={close}>
            Cancel
          </button>
          {modal.type === "import" && (
            <button className="button" onClick={exportBackup}>
              Back up first
            </button>
          )}
          <button
            className={
              "button " + (modal.type === "import" ? "primary" : "danger-solid")
            }
            onClick={() => {
              if (modal.type === "import") {
                setUnlocked({});
                setLibrary(modal.data);
                setSelected(
                  modal.data.notes.find((n) => !n.deletedAt)?.id || null,
                );
                setScope("all");
                toast("Backup imported.");
              } else {
                setLibrary((l) => ({
                  ...l,
                  notes: l.notes.filter((n) =>
                    modal.type === "emptyTrash"
                      ? !n.deletedAt
                      : n.id !== current.id,
                  ),
                }));
                setSelected(null);
                toast("Permanently deleted.");
              }
              close();
            }}
          >
            {modal.type === "import" ? "Replace library" : "Delete permanently"}
          </button>
        </div>
      </div>
    );
  if (modal.type === "settings")
    return (
      <div className="standard-dialog settings-dialog">
        {heading(
          Settings,
          "Make a little space your own",
          "Notes for Windows · Version 1.1.0",
        )}
        <div className="settings-section">
          <h3>Appearance</h3>
          <div className="theme-options">
            {[
              [Sun, "light", "Light"],
              [Moon, "dark", "Dark"],
              [Monitor, "system", "System"],
            ].map(([Icon, key, label]) => (
              <button
                key={key}
                className={settings.theme === key ? "selected" : ""}
                onClick={() => setSettings({ theme: key })}
              >
                <Icon size={23} />
                <span>{label}</span>
                {settings.theme === key && <Check size={12} />}
              </button>
            ))}
          </div>
          <div className="settings-fonts">
            <div className="settings-font-heading">
              <h3>Fonts & writing</h3>
              <button
                className="text-button"
                onClick={() =>
                  setSettings({
                    fontFamily: "system",
                    noteFontFamily: "inherit",
                  })
                }
              >
                Reset fonts
              </button>
            </div>
            <p className="helper">
              {FONTS.length} choices across sans serif, serif, monospace,
              handwriting, and Windows fonts. Bundled fonts work offline;
              Windows fonts depend on what is installed on your computer.
            </p>
            <FontPicker
              label="Interface font"
              value={settings.fontFamily || "system"}
              onChange={(fontFamily) => setSettings({ fontFamily })}
            />
            <FontPicker
              label="Note font"
              value={settings.noteFontFamily || "inherit"}
              onChange={(noteFontFamily) => setSettings({ noteFontFamily })}
              allowInherit
            />
          </div>
          <label className="field-label interface-size-control">
            Interface text size
            <select
              aria-label="Interface text size"
              value={settings.uiScale || 1}
              onChange={(e) => setSettings({ uiScale: Number(e.target.value) })}
            >
              <option value="1">Comfortable</option>
              <option value="1.1">Large</option>
              <option value="1.2">Extra large</option>
            </select>
          </label>
          <p className="helper">
            Adjust the sidebar, note list, menus, and buttons. Note text has its
            own size setting below.
          </p>
          <label className="range-label">
            <span>
              Editor text size <strong>{settings.fontSize} px</strong>
            </span>
            <input
              type="range"
              min="14"
              max="26"
              value={settings.fontSize}
              onChange={(e) =>
                setSettings({ fontSize: Number(e.target.value) })
              }
            />
          </label>
        </div>
        <div className="settings-section">
          <h3>Reminders</h3>
          <label className="toggle-row">
            <span>
              <strong>Keep reminders active in the system tray</strong>
              <small>
                Closing the window keeps Notes running. Choose Quit from its
                tray icon to exit.
              </small>
            </span>
            <input
              type="checkbox"
              aria-label="Keep reminders active in the system tray"
              checked={settings.remindersInTray !== false}
              disabled={!window.desktop}
              onChange={(event) =>
                setSettings({ remindersInTray: event.target.checked })
              }
            />
          </label>
          <p className="helper">
            {window.desktop
              ? "Notes must be running for Windows notifications. Open it after starting Windows; reminders missed while it was closed appear when it opens again."
              : "In-app reminders work while this tab stays open. Install the Windows app for notifications and system tray support."}
          </p>
        </div>
        <div className="settings-section">
          <h3>Your notes, your device</h3>
          <p className="helper">
            Notes and attachments save automatically. Export backups regularly
            to keep a separate copy. This app does not connect to iCloud or sync
            across devices.
          </p>
          <div className="button-row">
            <button className="button" onClick={exportBackup}>
              <Download size={15} /> Export backup
            </button>
            <button
              className="button"
              onClick={() => {
                close();
                backupInput.current.click();
              }}
            >
              <Upload size={15} /> Import backup
            </button>
          </div>
        </div>
        <div className="settings-about">
          <NotebookPen size={24} />
          <div>
            <strong>A familiar place. A fresh start.</strong>
            <p>
              An independent notes app inspired by Apple Notes.
              <br />
              Not affiliated with or endorsed by Apple.
            </p>
          </div>
        </div>
        <div className="dialog-actions">
          <button className="button primary" onClick={close}>
            Done
          </button>
        </div>
      </div>
    );
  if (modal.type === "shortcuts")
    return (
      <div className="standard-dialog">
        {heading(
          Keyboard,
          "A few useful shortcuts",
          "Keep your hands close to your ideas.",
        )}
        <dl className="shortcut-list">
          {[
            ["New note", "Ctrl + N"],
            ["Search all notes", "Ctrl + Shift + F"],
            ["Bold", "Ctrl + B"],
            ["Italic", "Ctrl + I"],
            ["Underline", "Ctrl + U"],
            ["Undo", "Ctrl + Z"],
            ["Redo", "Ctrl + Shift + Z"],
            ["Settings", "Ctrl + ,"],
            ["Close menu or dialog", "Esc"],
          ].map(([label, keys]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>
                <kbd>{keys}</kbd>
              </dd>
            </div>
          ))}
        </dl>
        <div className="dialog-actions">
          <button className="button primary" onClick={close}>
            Got it
          </button>
        </div>
      </div>
    );
  return null;
}
