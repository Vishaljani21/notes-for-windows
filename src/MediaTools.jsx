import React, { useEffect, useRef, useState } from "react";
import { Upload, ScanLine, Camera, LoaderCircle } from "lucide-react";
import { createWorker } from "tesseract.js";
import { escapeHTML } from "./lib.mjs";

export const fileDataURL = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

export function ScanTool({ insert, close, toast }) {
  const [image, setImage] = useState(""),
    [text, setText] = useState(""),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(""),
    [camera, setCamera] = useState(false);
  const input = useRef(null),
    video = useRef(null),
    stream = useRef(null),
    worker = useRef(null);
  useEffect(
    () => () => {
      stream.current?.getTracks().forEach((t) => t.stop());
      worker.current?.terminate();
    },
    [],
  );
  async function recognize(image) {
    setBusy(true);
    setProgress("Preparing English text recognition…");
    try {
      worker.current = await createWorker("eng", 1, {
        workerPath: new URL("./ocr/worker.min.js", location.href).href,
        corePath: new URL("./ocr/", location.href).href,
        langPath: "https://tessdata.projectnaptha.com/4.0.0",
        logger: (p) =>
          setProgress(`${p.status} · ${Math.round((p.progress || 0) * 100)}%`),
      });
      const result = await worker.current.recognize(image);
      setText(result.data.text.trim());
      setProgress(
        result.data.text.trim()
          ? "Text recognized. You can make corrections below."
          : "No text found. Try a sharper, well-lit photo.",
      );
    } catch (error) {
      setProgress(
        "Recognition failed: " +
          error.message +
          ". You can still attach the image.",
      );
    } finally {
      setBusy(false);
      await worker.current?.terminate();
      worker.current = null;
    }
  }
  async function useImage(file) {
    if (!file) return;
    if (file.size > 15 * 1024 * 1024)
      return toast("Please choose an image under 15 MB.");
    setImage(await fileDataURL(file));
    setText("");
    setProgress("");
  }
  async function openCamera() {
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      setCamera(true);
      setTimeout(() => {
        if (video.current) {
          video.current.srcObject = stream.current;
          video.current.play();
        }
      }, 80);
    } catch {
      toast("Camera access was unavailable. Choose a photo or scan instead.");
    }
  }
  function capture() {
    const canvas = document.createElement("canvas");
    canvas.width = video.current.videoWidth;
    canvas.height = video.current.videoHeight;
    canvas.getContext("2d").drawImage(video.current, 0, 0);
    setImage(canvas.toDataURL("image/jpeg", 0.9));
    stream.current.getTracks().forEach((t) => t.stop());
    setCamera(false);
    setText("");
  }
  return (
    <div className="tool-dialog">
      <div className="dialog-icon">
        <ScanLine size={26} />
      </div>
      <h2>From paper to possibility</h2>
      <p className="dialog-description">
        Bring a document into your notes and make its text searchable.
      </p>
      {camera ? (
        <div className="camera-preview">
          <video ref={video} muted playsInline />
          <button className="button primary" onClick={capture}>
            <Camera size={16} /> Capture document
          </button>
        </div>
      ) : image ? (
        <div className="scan-preview">
          <img src={image} alt="Document to recognize" />
        </div>
      ) : (
        <button className="upload-zone" onClick={() => input.current.click()}>
          <ScanLine size={36} />
          <strong>Choose a document photo</strong>
          <span>JPG, PNG, or WebP · up to 15 MB</span>
        </button>
      )}
      <input
        hidden
        type="file"
        accept="image/png,image/jpeg,image/webp"
        ref={input}
        onChange={(e) => useImage(e.target.files[0])}
      />
      <div className="button-row centered">
        <button
          className="button"
          disabled={busy}
          onClick={() => input.current.click()}
        >
          <Upload size={15} /> {image ? "Change image" : "Choose image"}
        </button>
        <button
          className="button"
          disabled={busy || camera}
          onClick={openCamera}
        >
          <Camera size={15} /> Use camera
        </button>
        {image && (
          <button
            className="button primary"
            disabled={busy}
            onClick={() => recognize(image)}
          >
            {busy ? (
              <LoaderCircle className="spin" size={15} />
            ) : (
              <ScanLine size={15} />
            )}{" "}
            {busy ? "Recognizing…" : "Recognize text"}
          </button>
        )}
      </div>
      {progress && <p className="helper">{progress}</p>}
      {text && (
        <textarea
          className="scan-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-label="Recognized document text"
        />
      )}
      <p className="helper">
        English OCR runs on your device. The first use downloads a language
        model. This captures photos and extracts text; automatic page edge
        detection and PDF scanning are not included.
      </p>
      <div className="dialog-actions">
        <button className="button" onClick={close}>
          Cancel
        </button>
        <button
          className="button primary"
          disabled={!image || busy || camera}
          onClick={() => {
            insert(
              `<img src="${image}" alt="Scanned document">${
                text
                  ? "<h2>Recognized text</h2>" +
                    text
                      .split("\n")
                      .map((line) => `<p>${escapeHTML(line)}</p>`)
                      .join("")
                  : ""
              }<p></p>`,
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
