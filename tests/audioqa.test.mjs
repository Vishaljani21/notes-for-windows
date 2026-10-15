import { test } from "node:test";
import assert from "node:assert/strict";
import {
  transcriptChunks,
  quotedAudioAnswer,
  bestAudioAnswer,
  audioAnswersContent,
  audioAnswerSpan,
  savedAudioBlob,
} from "../src/audioqa.mjs";

test("saved audio is decoded locally without fetch and preserves its media type", async () => {
  const clip = savedAudioBlob("data:audio/webm;codecs=opus;base64,AAECAw==");
  assert.equal(clip.type, "audio/webm");
  assert.deepEqual([...new Uint8Array(await clip.arrayBuffer())], [0, 1, 2, 3]);
  assert.throws(() => savedAudioBlob("https://example.com/audio.wav"));
  assert.throws(() => savedAudioBlob("data:text/html;base64,AAEC"));
  assert.throws(() => savedAudioBlob("data:audio/wav;base64,%%%"));
});

test("long transcripts are fully covered by overlapping, token-bounded original slices", () => {
  const transcript = Array.from(
    { length: 500 },
    (_, index) => `Sentence ${index}: the deadline is Friday.\n`,
  ).join("");
  const countTokens = (text) => text.length;
  const chunks = transcriptChunks(transcript, countTokens, 240);
  assert.ok(chunks.length > 2);
  assert.equal(chunks[0].start, 0);
  assert.equal(chunks.at(-1).end, transcript.length);
  for (let index = 0; index < chunks.length; index++) {
    const chunk = chunks[index];
    assert.equal(chunk.text, transcript.slice(chunk.start, chunk.end));
    assert.ok(countTokens(chunk.text) <= 240);
    if (index) {
      assert.ok(chunk.start < chunks[index - 1].end);
      assert.ok(chunk.end > chunks[index - 1].end);
    }
  }
  assert.deepEqual(transcriptChunks("", countTokens), []);
  const unbroken = transcriptChunks("x".repeat(5000), countTokens, 100);
  assert.equal(unbroken.at(-1).end, 5000);
});

test("audio answers must match the original transcript and pass confidence guard", () => {
  const source =
    "We agreed the final deadline is Friday, 23 October. Priya will send the design.";
  const valid = quotedAudioAnswer(source, {
    answer: "friday, 23 october",
    score: 0.75,
  });
  assert.equal(valid.answer, "Friday, 23 October");
  assert.equal(valid.quote, source);
  assert.equal(
    quotedAudioAnswer(source, { answer: "Tuesday", score: 0.99 }),
    null,
  );
  assert.equal(
    quotedAudioAnswer(source, { answer: "Friday", score: NaN }),
    null,
  );
  assert.equal(bestAudioAnswer([{ ...valid, score: 0.02 }, null]), null);
  assert.deepEqual(bestAudioAnswer([valid, { ...valid, score: 0.2 }]), valid);
  assert.equal(
    quotedAudioAnswer(source, { answer: "word ".repeat(70), score: 0.9 }),
    null,
  );
});

test("SQuAD2 span decoding abstains when no-answer wins and masks question tokens", () => {
  const starts = [0, 100, -3, 8, 1, -3];
  const ends = [0, 100, -3, 0, 8, -3];
  const span = audioAnswerSpan(starts, ends, [3, 4]);
  assert.equal(span.start, 3);
  assert.equal(span.end, 4);
  assert.ok(span.score > 0.9);
  assert.equal(audioAnswerSpan([9, 100, -3, 1], [9, 100, -3, 1], [3]), null);
  assert.equal(audioAnswerSpan(starts, ends, []), null);
});

test("saving audio Q&A preserves quoted evidence and excludes unanswered questions", () => {
  const nodes = audioAnswersContent([
    { question: "When?", answer: "Friday", quote: "The deadline is Friday." },
    { question: "What is the budget?" },
  ]);
  assert.equal(nodes[0].content[0].text, "Audio questions");
  assert.equal(nodes.length, 4);
  assert.equal(nodes[3].type, "blockquote");
  assert.equal(nodes[3].content[0].content[0].text, "The deadline is Friday.");
  assert.deepEqual(audioAnswersContent([{ question: "No evidence?" }]), []);
});
