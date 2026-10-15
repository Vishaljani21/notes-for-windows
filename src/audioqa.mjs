export const AUDIO_QA_MODEL = "onnx-community/tinyroberta-squad2-ONNX";
export const MAX_AUDIO_QA_CHARACTERS = 120000;

export function savedAudioBlob(source) {
  const comma = source.indexOf(",");
  const header = source.slice(0, comma);
  const mime = header.slice(5).split(";")[0];
  if (
    comma < 0 ||
    !header.startsWith("data:") ||
    !header.endsWith(";base64") ||
    !/^(audio\/[\w.+-]+|application\/octet-stream)$/i.test(mime)
  )
    throw new Error("The saved audio format is not supported.");
  const bytes = Uint8Array.from(atob(source.slice(comma + 1)), (character) =>
    character.charCodeAt(0),
  );
  return new Blob([bytes], { type: mime });
}

// Work with slices of the original transcript so quoted evidence is never
// reconstructed by a tokenizer. Overlap keeps answers across section edges.
export function transcriptChunks(text, countTokens, maxTokens = 300) {
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    let low = start + 1;
    let high = Math.min(text.length, start + maxTokens * 16);
    let end = start;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      if (countTokens(text.slice(start, middle)) <= maxTokens) {
        end = middle;
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }
    if (end === start)
      throw new Error("A transcript section could not be read.");
    if (end < text.length) {
      const boundary = text.slice(start, end).search(/\s+\S*$/);
      if (boundary > (end - start) * 0.75) end = start + boundary;
    }
    chunks.push({ text: text.slice(start, end), start, end });
    if (end === text.length) break;
    // Keep roughly a quarter of each section, without ever stalling.
    const overlap = Math.min(240, Math.floor((end - start) / 4));
    const next = Math.max(start + 1, end - overlap);
    const boundary = text.slice(next, end).search(/\s/);
    start = boundary >= 0 ? next + boundary + 1 : next;
  }
  return chunks;
}

export function quotedAudioAnswer(context, result) {
  if (!result?.answer?.trim() || !Number.isFinite(result.score)) return null;
  const words = result.answer.trim().split(/\s+/);
  if (words.length > 60 || result.answer.length > 500) return null;
  const pattern = words
    .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("\\s+");
  const match = new RegExp(pattern, "i").exec(context);
  if (!match) return null;
  const start = match.index;
  const end = start + match[0].length;
  const quoteStart = Math.max(0, start - 160);
  const quoteEnd = Math.min(context.length, end + 160);
  return {
    answer: match[0],
    score: result.score,
    quote:
      (quoteStart ? "…" : "") +
      context.slice(quoteStart, quoteEnd).trim() +
      (quoteEnd < context.length ? "…" : ""),
  };
}

// SQuAD 2 models place their no-answer prediction at CLS (token zero).
// Compare it with a bounded context span, excluding question/padding tokens.
export function audioAnswerSpan(
  startLogits,
  endLogits,
  contextTokens,
  maxAnswerTokens = 40,
) {
  let best = null;
  const allowed = new Set(contextTokens);
  for (const start of contextTokens) {
    for (
      let end = start;
      end < Math.min(endLogits.length, start + maxAnswerTokens);
      end++
    ) {
      if (!allowed.has(end)) break;
      const logit = startLogits[start] + endLogits[end];
      if (!best || logit > best.logit) best = { start, end, logit };
    }
  }
  if (
    !best ||
    !Number.isFinite(best.logit) ||
    best.logit <= startLogits[0] + endLogits[0]
  )
    return null;
  const logSumExp = (logits) => {
    const values = [logits[0], ...contextTokens.map((index) => logits[index])];
    const maximum = Math.max(...values);
    return (
      maximum +
      Math.log(
        values.reduce((sum, value) => sum + Math.exp(value - maximum), 0),
      )
    );
  };
  return {
    start: best.start,
    end: best.end,
    score: Math.exp(best.logit - logSumExp(startLogits) - logSumExp(endLogits)),
  };
}

export function bestAudioAnswer(candidates, minimumScore = 0.15) {
  return (
    candidates
      .filter((answer) => answer && answer.score >= minimumScore)
      .sort((a, b) => b.score - a.score)[0] || null
  );
}

export function audioAnswersContent(answers) {
  const answered = answers.filter((item) => item.answer);
  if (!answered.length) return [];
  return [
    {
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: "Audio questions" }],
    },
    ...answered.flatMap((item) => [
      {
        type: "paragraph",
        content: [
          { type: "text", text: item.question, marks: [{ type: "bold" }] },
        ],
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Possible answer: " + item.answer }],
      },
      {
        type: "blockquote",
        content: [
          { type: "paragraph", content: [{ type: "text", text: item.quote }] },
        ],
      },
    ]),
  ];
}
