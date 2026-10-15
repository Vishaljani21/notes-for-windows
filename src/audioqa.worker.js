import { pipeline, env } from "@huggingface/transformers";
import {
  AUDIO_QA_MODEL,
  MAX_AUDIO_QA_CHARACTERS,
  transcriptChunks,
  quotedAudioAnswer,
  bestAudioAnswer,
  audioAnswerSpan,
} from "./audioqa.mjs";

env.allowLocalModels = false;
env.backends.onnx.wasm.numThreads = 1;
let answerer;
let busy = false;
self.postMessage({ status: "ready" });

self.onmessage = async ({ data }) => {
  if (busy) return;
  busy = true;
  const { id, question, transcript } = data;
  const send = (message) => self.postMessage({ id, ...message });
  try {
    if (!question?.trim() || !transcript?.trim())
      throw new Error("Add a transcript and a question first.");
    if (question.length > 300)
      throw new Error("Keep your question under 300 characters.");
    if (transcript.length > MAX_AUDIO_QA_CHARACTERS)
      throw new Error(
        "This transcript is too long. Select a section under 120,000 characters.",
      );
    send({ status: "loading" });
    answerer ||= await pipeline("question-answering", AUDIO_QA_MODEL, {
      dtype: "q8",
      device: "wasm",
      progress_callback: (progress) => {
        if (progress.status === "progress")
          send({
            status: "progress",
            progress: Math.round(progress.progress),
            file: progress.file,
          });
      },
    });
    const tokenCount = (text) =>
      answerer.tokenizer.encode(text, { add_special_tokens: false }).length;
    if (tokenCount(question) > 64)
      throw new Error(
        "Please ask a shorter question (up to 64 words or word pieces).",
      );
    // 300 context + 64 question + special tokens fits the model's 384-token training window.
    const chunks = transcriptChunks(transcript, tokenCount);
    const candidates = [];
    for (let index = 0; index < chunks.length; index++) {
      send({ status: "answering", current: index + 1, total: chunks.length });
      const inputs = answerer.tokenizer(question.trim(), {
        text_pair: chunks[index].text,
        padding: true,
        truncation: true,
      });
      const { start_logits, end_logits } = await answerer.model(inputs);
      const ids = inputs.input_ids.tolist()[0];
      const attention = inputs.attention_mask.tolist()[0];
      const separator = ids.findIndex(
        (id) => Number(id) === answerer.tokenizer.sep_token_id,
      );
      const special = new Set(answerer.tokenizer.all_special_ids.map(Number));
      const contextTokens = ids
        .map((_, token) => token)
        .filter(
          (token) =>
            token > separator &&
            Number(attention[token]) &&
            !special.has(Number(ids[token])),
        );
      const span = audioAnswerSpan(
        start_logits.tolist()[0],
        end_logits.tolist()[0],
        contextTokens,
      );
      const result = span && {
        answer: answerer.tokenizer.decode(ids.slice(span.start, span.end + 1), {
          skip_special_tokens: true,
        }),
        score: span.score,
      };
      candidates.push(quotedAudioAnswer(chunks[index].text, result));
    }
    send({ status: "complete", result: bestAudioAnswer(candidates) });
  } catch (error) {
    send({
      status: "error",
      message: error.message || "The question engine could not start.",
    });
  } finally {
    busy = false;
  }
};
