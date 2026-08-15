import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const streamToString = (stream) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    stream.on("error", reject);
  });

export const loadAwsTranscript = async (videoId) => {
  const s3Response = await s3.send(
    new GetObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME,
      Key: `transcripts/${videoId}.json`,
    })
  );

  const raw = await streamToString(s3Response.Body);
  const data = JSON.parse(raw);

  if (!data?.results?.items) {
    throw new Error(`AWS Transcript items missing in S3 output for videoId: ${videoId}`);
  }

  return data;
};

const LONG_PAUSE_MS = 3000;
const SENTENCE_END_PUNCTUATION = new Set([".", "?", "!"]);

export const parseAwsItems = (items, longPauseMs = LONG_PAUSE_MS) => {
  const units = [];
  let currentWords = [];
  let currentStartMs = null;
  let currentEndMs = null;

  const pushUnit = () => {
    if (currentWords.length > 0) {
      units.push({
        text: currentWords.map(w => w.text).join(" "),
        startMs: currentStartMs,
        endMs: currentEndMs,
        words: currentWords,
      });
      currentWords = [];
      currentStartMs = null;
      currentEndMs = null;
    }
  };

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    
    if (item.type === "pronunciation") {
      const startMs = Math.round(Number(item.start_time) * 1000);
      const endMs = Math.round(Number(item.end_time) * 1000);
      const text = item.alternatives[0]?.content || "";

      // Check for long pause fallback
      if (currentEndMs !== null && (startMs - currentEndMs) >= longPauseMs && currentWords.length > 0) {
        pushUnit();
      }

      if (currentStartMs === null) {
        currentStartMs = startMs;
      }
      currentEndMs = endMs;
      
      currentWords.push({
        text,
        startMs,
        endMs
      });

    } else if (item.type === "punctuation") {
      const punc = item.alternatives[0]?.content || "";
      if (currentWords.length > 0) {
        // Attach punctuation to the last word without space
        currentWords[currentWords.length - 1].text += punc;

        // If it's sentence-ending, finalize the unit
        if (SENTENCE_END_PUNCTUATION.has(punc)) {
          pushUnit();
        }
      }
    }
  }

  pushUnit(); // Handle any remaining text

  return units;
};

export const splitOversizedUnit = (unit, targetMaxChars) => {
  const pieces = [];
  let currentWords = [];
  let currentLen = 0;

  const pushPiece = () => {
    if (currentWords.length > 0) {
      pieces.push({
        text: currentWords.map(w => w.text).join(" "),
        startMs: currentWords[0].startMs,
        endMs: currentWords[currentWords.length - 1].endMs,
      });
      currentWords = [];
      currentLen = 0;
    }
  };

  for (const word of unit.words) {
    const wordLen = word.text.length + (currentWords.length > 0 ? 1 : 0);
    
    if (currentWords.length > 0 && currentLen + wordLen > targetMaxChars) {
      pushPiece();
    }
    
    currentWords.push(word);
    currentLen += (word.text.length + (currentWords.length > 1 ? 1 : 0));
  }

  pushPiece();

  return pieces;
};

export const buildChunksFromUnits = (units, targetMaxChars = 500) => {
  const chunks = [];
  let currentChunkUnits = [];
  let currentLen = 0;

  const pushChunk = () => {
    if (currentChunkUnits.length > 0) {
      chunks.push({
        content: currentChunkUnits.map(u => u.text).join(" "),
        startMs: currentChunkUnits[0].startMs,
        endMs: currentChunkUnits[currentChunkUnits.length - 1].endMs,
      });
      currentChunkUnits = [];
      currentLen = 0;
    }
  };

  for (const unit of units) {
    if (unit.text.length > targetMaxChars) {
      // If we already have something in the current chunk, push it first
      pushChunk();

      // Split the oversized unit
      const splitPieces = splitOversizedUnit(unit, targetMaxChars);
      for (const piece of splitPieces) {
        chunks.push({
          content: piece.text,
          startMs: piece.startMs,
          endMs: piece.endMs,
        });
      }
    } else {
      const unitLen = unit.text.length + (currentChunkUnits.length > 0 ? 1 : 0);
      
      if (currentChunkUnits.length > 0 && currentLen + unitLen > targetMaxChars) {
        pushChunk();
      }
      
      currentChunkUnits.push(unit);
      currentLen += unitLen;
    }
  }

  pushChunk();

  return chunks;
};
