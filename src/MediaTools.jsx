import React, { useEffect, useRef, useState } from "react";
import {
  Mic,
  Square,
  Play,
  FileAudio,
  Upload,
  ScanLine,
  Camera,
  LoaderCircle,
  Check,
  X,
} from "lucide-react";
import { createWorker } from "tesseract.js";
import { escapeHTML } from "./lib.mjs";

export const fileDataURL = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
export function AudioTool({ insert, close, toast }) {
  const [recording, setRecording] = useState(false),
    [blob, setBlob] = useState(null),
    [url, setUrl] = useState(""),
    [seconds, setSeconds] = useState(0),
    [transcript, setTranscript] = useState(""),
    [status, setStatus] = useState(""),
    [busy, setBusy] = useState(false);
  const recorder = useRef(null),
    stream = useRef(null),
    worker = useRef(null),
    input = useRef(null);
  useEffect(() => {
    if (!recording) return;
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [recording]);
  useEffect(
    () => () => {
      if (recorder.current?.state === "recording") recorder.current.stop();
      stream.current?.getTracks().forEach((t) => t.stop());
      worker.current?.terminate();
    },
    [],
  );
  useEffect(() => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    setUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [blob]);
  async function start() {
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      const rec = new MediaRecorder(stream.current);
      recorder.current = rec;
      const chunks = [];
      rec.ondataavailable = (e) => chunks.push(e.data);
      rec.onstop = () => {
        setBlob(new Blob(chunks, { type: rec.mimeType }));
        stream.current.getTracks().forEach((t) => t.stop());
        setRecording(false);
      };
      rec.start();
      setRecording(true);
      setBlob(null);
      setTranscript("");
      setSeconds(0);
    } catch {
      toast(
        "Microphone access was unavailable. You can import an audio file instead.",
      );
    }
  }
  async function transcribe() {
    if (!blob) return;
    setBusy(true);
    setStatus("Preparing the on-device speech model…");
    try {
      const context = new AudioContext({ sampleRate: 16000 });
      let decoded;
      try {
        decoded = await context.decodeAudioData(await blob.arrayBuffer());
      } finally {
        await context.close();
      }
      const audio = new Float32Array(decoded.length);
      for (let c = 0; c < decoded.numberOfChannels; c++) {
        const channel = decoded.getChannelData(c);
        for (let i = 0; i < channel.length; i++)
          audio[i] += channel[i] / decoded.numberOfChannels;
      }
      worker.current ||= new Worker(
        new URL("./speech.worker.js", import.meta.url),
        { type: "module" },
      );
      worker.current.onerror = () => {
        setBusy(false);
        setStatus(
          "The speech engine could not start. Your audio is still available to save.",
        );
      };
      worker.current.onmessage = ({ data }) => {
        if (data.status === "progress")
          setStatus(`Downloading speech model · ${data.progress}%`);
        if (data.status === "complete") {
          setTranscript(data.text.trim());
          setStatus("Transcribed on your device");
          setBusy(false);
        }
        if (data.status === "error") {
          setStatus("Transcription failed: " + data.message);
          setBusy(false);
        }
      };
      setStatus("Transcribing on your device…");
      worker.current.postMessage({ audio }, [audio.buffer]);
    } catch (error) {
      setStatus("Could not decode audio: " + error.message);
      setBusy(false);
    }
  }
  return (
    <div className="tool-dialog">
      <div className="dialog-icon">
        <Mic size={26} />
      </div>
      <h2>Capture the conversation</h2>
      <p className="dialog-description">
        Record a thought, an interview, or a little inspiration.
      </p>
      <div className={"recorder " + (recording ? "is-recording" : "")}>
        <div className="waveform">
          {Array.from({ length: 34 }, (_, i) => (
            <i
              key={i}
              style={{
                height: 12 + ((i * 17 + 9) % 38) + "px",
                animationDelay: i * 0.05 + "s",
              }}
            />
          ))}
        </div>
        <strong>
          {Math.floor(seconds / 60)
            .toString()
            .padStart(2, "0")}
          :{(seconds % 60).toString().padStart(2, "0")}
        </strong>
        <span>
          {recording
            ? "Recording…"
            : blob
              ? "Your audio is ready"
              : "Ready when you are"}
        </span>
      </div>
      {url && <audio controls src={url} className="audio-preview" />}
      <div className="button-row centered">
        <button
          className={recording ? "button danger-solid" : "button primary"}
          onClick={() => (recording ? recorder.current.stop() : start())}
          disabled={busy}
        >
          {recording ? <Square size={15} /> : <Mic size={15} />}{" "}
          {recording ? "Stop recording" : "Record audio"}
        </button>
        <button
          className="button"
          disabled={recording || busy}
          onClick={() => input.current.click()}
        >
          <Upload size={15} /> Import audio
        </button>
        <input
          hidden
          ref={input}
          type="file"
          accept="audio/*"
          onChange={(e) => {
            const f = e.target.files[0];
            if (f?.size > 20 * 1024 * 1024)
              return toast("Please choose an audio file under 20 MB.");
            if (f) {
              setBlob(f);
              setTranscript("");
            }
          }}
        />
      </div>
      {blob && (
        <div className="transcript-area">
          <div className="section-label">
            <span>TRANSCRIPT</span>
            <button
              className="text-button"
              onClick={transcribe}
              disabled={busy}
            >
              {busy && <LoaderCircle size={13} className="spin" />}
              {busy ? "Working…" : "Transcribe audio"}
            </button>
          </div>
          <textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            placeholder="Generate an English transcript, or add your own…"
          />
          {status && <p className="helper">{status}</p>}
        </div>
      )}
      <p className="helper">
        English transcription uses Whisper on your device. The first use
        downloads a speech model (about 100 MB); audio stays on this device.
        Internet access is needed for model downloads.
      </p>
      <div className="dialog-actions">
        <button className="button" onClick={close}>
          Cancel
        </button>
        <button
          className="button primary"
          disabled={!blob || recording || busy}
          onClick={async () => {
            const src = await fileDataURL(blob);
            insert([
              { type: "audioClip", attrs: { src } },
              ...(transcript
                ? [
                    {
                      type: "heading",
                      attrs: { level: 2 },
                      content: [{ type: "text", text: "Transcript" }],
                    },
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: transcript }],
                    },
                  ]
                : []),
              { type: "paragraph" },
            ]);
            close();
          }}
        >
          Add to note
        </button>
      </div>
    </div>
  );
}
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
