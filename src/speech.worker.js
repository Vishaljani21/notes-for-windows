import { pipeline, env } from "@huggingface/transformers";
env.allowLocalModels = false;
env.backends.onnx.wasm.numThreads = 1;
let transcriber;
self.onmessage = async ({ data }) => {
  try {
    transcriber ||= await pipeline(
      "automatic-speech-recognition",
      "onnx-community/whisper-tiny.en",
      {
        dtype: "q8",
        device: "wasm",
        progress_callback: (progress) => {
          if (progress.status === "progress")
            self.postMessage({
              status: "progress",
              progress: Math.round(progress.progress),
              file: progress.file,
            });
        },
      },
    );
    const output = await transcriber(data.audio, {
      chunk_length_s: 30,
      stride_length_s: 5,
    });
    self.postMessage({ status: "complete", text: output.text });
  } catch (error) {
    self.postMessage({ status: "error", message: error.message });
  }
};
