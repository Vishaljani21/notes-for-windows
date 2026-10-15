import React, { useEffect, useId, useRef, useState } from "react";
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
  MessageCircle,
} from "lucide-react";
import { createWorker } from "tesseract.js";
import { escapeHTML } from "./lib.mjs";
import {
  audioAnswersContent,
  MAX_AUDIO_QA_CHARACTERS,
  savedAudioBlob,
} from "./audioqa.mjs";

export { audioAnswersContent as qaAnswersToNodes } from "./audioqa.mjs";

export const fileDataURL = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
export function AudioQuestions({
  transcript = "",
  onAnswersChange,
  onBusyChange,
}) {
  const questionId = useId();
  const [question, setQuestion] = useState("");
  const [answers, setAnswers] = useState([]);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const worker = useRef(null);
  const request = useRef(0);
  const callbacks = useRef({ onAnswersChange, onBusyChange });
  callbacks.current = { onAnswersChange, onBusyChange };
  useEffect(() => {
    callbacks.current.onAnswersChange?.(answers);
  }, [answers]);
  useEffect(() => {
    callbacks.current.onBusyChange?.(busy);
  }, [busy]);
  useEffect(() => {
    request.current++;
    worker.current?.terminate();
    worker.current = null;
    setBusy(false);
    setAnswers([]);
    setStatus("");
    return () => {
      request.current++;
      worker.current?.terminate();
      worker.current = null;
      callbacks.current.onBusyChange?.(false);
      callbacks.current.onAnswersChange?.([]);
    };
  }, [transcript]);
  function cancel() {
    request.current++;
    worker.current?.terminate();
    worker.current = null;
    setBusy(false);
    setStatus("Question cancelled. Your transcript is unchanged.");
  }
  function ask(event) {
    event.preventDefault();
    const text = question.trim();
    if (!text || busy || !transcript.trim()) return;
    if (transcript.length > MAX_AUDIO_QA_CHARACTERS) {
      setStatus(
        "Choose a shorter transcript section (under 120,000 characters) to ask about.",
      );
      return;
    }
    setBusy(true);
    setStatus(
      "Preparing the on-device question model… First use needs internet access.",
    );
    const id = ++request.current;
    try {
      worker.current ||= new Worker(
        new URL("./audioqa.worker.js", import.meta.url),
        { type: "module" },
      );
      worker.current.onerror = () => {
        if (request.current !== id) return;
        setBusy(false);
        setStatus(
          "The question engine could not start. Check your internet connection for the first model download, then try again.",
        );
        worker.current?.terminate();
        worker.current = null;
      };
      worker.current.onmessage = ({ data }) => {
        if (data.id !== request.current) return;
        if (data.status === "loading")
          setStatus("Loading the question model on your device…");
        if (data.status === "progress")
          setStatus(`Downloading question model · ${data.progress}%`);
        if (data.status === "answering")
          setStatus(
            `Reading transcript · section ${data.current} of ${data.total}`,
          );
        if (data.status === "complete") {
          setAnswers((items) => [
            ...items,
            { question: text, ...(data.result || {}) },
          ]);
          setQuestion("");
          setBusy(false);
          setStatus(
            "Answered on your device. Check the quoted transcript before relying on an answer.",
          );
        }
        if (data.status === "error") {
          setBusy(false);
          setStatus(
            "Could not answer: " +
              data.message +
              " You can retry when the model is available.",
          );
        }
      };
      worker.current.postMessage({ id, question: text, transcript });
    } catch (error) {
      setBusy(false);
      setStatus("Could not start the question engine: " + error.message);
    }
  }
  return (
    <section className="audio-questions" aria-label="Ask questions about audio">
      <div className="audio-questions-heading">
        <MessageCircle size={18} />
        <h3>Ask about this audio</h3>
      </div>
      <p className="helper">
        Ask a specific question, such as “When is the deadline?” Answers are
        excerpts from the English transcript. Check the transcript for speech
        recognition errors.
      </p>
      <form className="audio-question-form" onSubmit={ask}>
        <label htmlFor={questionId}>Question about audio</label>
        <input
          id={questionId}
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="What did they decide?"
          maxLength={300}
          disabled={busy || !transcript.trim()}
        />
        <div className="button-row">
          <button
            type="submit"
            className="button primary"
            disabled={busy || !question.trim() || !transcript.trim()}
          >
            {busy ? (
              <LoaderCircle size={15} className="spin" />
            ) : (
              <MessageCircle size={15} />
            )}
            {busy ? "Reading…" : "Ask audio"}
          </button>
          {busy && (
            <button type="button" className="button" onClick={cancel}>
              Cancel question
            </button>
          )}
        </div>
      </form>
      {status && (
        <p className="helper audio-question-status" role="status">
          {status}
        </p>
      )}
      {answers.length > 0 && (
        <div
          className="audio-answer-list"
          aria-label="Audio answers"
          aria-live="polite"
        >
          {answers.map((item, index) => (
            <article className="audio-answer" key={index}>
              <h4>{item.question}</h4>
              {item.answer ? (
                <>
                  <span className="audio-answer-label">Possible answer</span>
                  <p>{item.answer}</p>
                  <blockquote>{item.quote}</blockquote>
                </>
              ) : (
                <p>
                  I couldn’t find a confident answer in this transcript. Try a
                  more specific question, or check whether the information was
                  recorded.
                </p>
              )}
            </article>
          ))}
        </div>
      )}
      <p className="helper">
        Questions run on this device; your audio, transcript and questions are
        not uploaded. A separate model downloads on first use and is cached for
        offline use.{" "}
        <a
          href="https://huggingface.co/onnx-community/tinyroberta-squad2-ONNX"
          onClick={(event) => {
            if (!window.desktop) return;
            event.preventDefault();
            window.desktop.openExternal(
              "https://huggingface.co/onnx-community/tinyroberta-squad2-ONNX",
            );
          }}
          target="_blank"
          rel="noreferrer"
        >
          tinyroberta by deepset / ONNX Community · CC BY 4.0
        </a>
        .
      </p>
    </section>
  );
}

export function AudioTool({
  insert,
  close,
  toast,
  initialAudioSrc = "",
  initialTranscript = "",
}) {
  const [recording, setRecording] = useState(false),
    [blob, setBlob] = useState(null),
    [url, setUrl] = useState(""),
    [seconds, setSeconds] = useState(0),
    [transcript, setTranscript] = useState(initialTranscript),
    [status, setStatus] = useState(""),
    [busy, setBusy] = useState(false),
    [qaBusy, setQaBusy] = useState(false),
    [answers, setAnswers] = useState([]),
    [includeAudio, setIncludeAudio] = useState(!initialAudioSrc);
  const recorder = useRef(null),
    stream = useRef(null),
    worker = useRef(null),
    input = useRef(null);
  useEffect(() => {
    if (!initialAudioSrc) return;
    try {
      setBlob(savedAudioBlob(initialAudioSrc));
    } catch {
      setStatus(
        "This audio clip could not be loaded. You can import it again.",
      );
    }
  }, [initialAudioSrc]);
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
      setIncludeAudio(true);
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
      <h2>
        {initialAudioSrc ? "Ask about your audio" : "Capture the conversation"}
      </h2>
      <p className="dialog-description">
        {initialAudioSrc
          ? "Transcribe the saved recording, then ask questions about it."
          : "Record a thought, an interview, or a little inspiration."}
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
          disabled={busy || qaBusy}
        >
          {recording ? <Square size={15} /> : <Mic size={15} />}{" "}
          {recording ? "Stop recording" : "Record audio"}
        </button>
        <button
          className="button"
          disabled={recording || busy || qaBusy}
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
              setIncludeAudio(true);
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
              disabled={busy || qaBusy}
            >
              {busy && <LoaderCircle size={13} className="spin" />}
              {busy ? "Working…" : "Transcribe audio"}
            </button>
          </div>
          <textarea
            aria-label="Audio transcript"
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            placeholder="Generate an English transcript, or add your own…"
          />
          {status && <p className="helper">{status}</p>}
        </div>
      )}
      {transcript.trim() && (
        <AudioQuestions
          transcript={transcript}
          onAnswersChange={setAnswers}
          onBusyChange={setQaBusy}
        />
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
          disabled={
            !blob ||
            recording ||
            busy ||
            qaBusy ||
            (!includeAudio && !transcript.trim())
          }
          onClick={async () => {
            const src = includeAudio ? await fileDataURL(blob) : null;
            insert([
              ...(src ? [{ type: "audioClip", attrs: { src } }] : []),
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
              ...audioAnswersContent(answers),
              { type: "paragraph" },
            ]);
            close();
          }}
        >
          {includeAudio ? "Add to note" : "Add transcript to note"}
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
