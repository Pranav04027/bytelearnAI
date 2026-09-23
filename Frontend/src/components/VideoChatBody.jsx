import React, { useState, useRef, useEffect } from "react";
import axiosInstance from "../api/axios.js";
import { formatMsToTimestamp } from "../utils/time.js";
import { Bot, SearchX, Send } from "lucide-react";

// Matches [Source 1] or [Source 1, Source 2, Source 4]
const CITATION_RE = /\[Source\s+(\d+(?:\s*,\s*Source\s+\d+)*)\]/g;

// Remove a trailing "Sources" block that only lists timestamps so the model
// doesn't duplicate citation information already rendered inline.
function stripTrailingSources(content) {
  const blocks = content.split(/\n{2,}/);
  while (blocks.length) {
    const lines = blocks[blocks.length - 1].split("\n");
    const firstLine = lines[0].trim();
    const restAreTimestamps = lines
      .slice(1)
      .every(
        (l) =>
          l.trim() === "" || /^[\d:]+\s*[–-]\s*[\d:]*$/.test(l.trim())
      );
    if (/^sources?\s*$/i.test(firstLine) && restAreTimestamps) {
      blocks.pop();
    } else {
      break;
    }
  }
  return blocks.join("\n\n");
}

// Inline **bold** and *italic* -> React nodes (no HTML injection).
function renderInline(text) {
  const nodes = [];
  const regex = /(\*\*([^*]+)\*\*|\*([^*]+)\*)/g;
  let last = 0;
  let m;
  let i = 0;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    if (m[2] !== undefined) nodes.push(<strong key={`b${i++}`}>{m[2]}</strong>);
    else if (m[3] !== undefined) nodes.push(<em key={`i${i++}`}>{m[3]}</em>);
    last = regex.lastIndex;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function CitationChip({ source, onSeekToMs }) {
  if (!source) return null;
  return (
    <button
      type="button"
      onClick={() => onSeekToMs && onSeekToMs(source.startMs)}
      title={`Jump to ${formatMsToTimestamp(source.startMs)}`}
      className="inline-flex items-center gap-1 mx-0.5 my-0.5 align-middle text-[11px] font-mono bg-white hover:bg-slate-50 text-[#994d51] border border-slate-200 rounded-full px-2 py-0.5 shadow-sm transition-colors"
    >
      <span aria-hidden="true">▶</span>
      {formatMsToTimestamp(source.startMs)}–{formatMsToTimestamp(source.endMs)}
    </button>
  );
}

// Render a single block of transcript-context text, turning [Source N]
// markers into inline clickable chips and applying light markdown formatting.
function renderBlockContent(block, sourceById, onSeekToMs, prefix) {
  const re = new RegExp(CITATION_RE.source, "g");
  const tokens = [];
  let last = 0;
  let m;
  while ((m = re.exec(block)) !== null) {
    if (m.index > last) tokens.push({ type: "text", value: block.slice(last, m.index) });
    const ids = m[1]
      .split(/\s*,\s*Source\s*/i)
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !Number.isNaN(n));
    tokens.push({ type: "cite", ids });
    last = re.lastIndex;
  }
  if (last < block.length) tokens.push({ type: "text", value: block.slice(last) });

  const nodes = [];
  let ki = 0;
  tokens.forEach((tok) => {
    if (tok.type === "cite") {
      tok.ids.forEach((id) => {
        if (sourceById[id]) {
          nodes.push(
            <CitationChip
              key={`${prefix}-c${id}`}
              source={sourceById[id]}
              onSeekToMs={onSeekToMs}
            />
          );
        }
      });
    } else {
      renderInline(tok.value).forEach((n) =>
        nodes.push(<span key={`${prefix}-i${ki++}`}>{n}</span>)
      );
    }
  });
  return nodes;
}

function AnswerContent({ content, sources, onSeekToMs }) {
  const sourceById = {};
  (sources || []).forEach((s) => {
    sourceById[s.sourceId] = s;
  });

  const cleaned = stripTrailingSources(content || "");
  const blocks = cleaned.split(/\n{2,}/);

  const hasInline =
    (sources || []).length > 0 &&
    (sources || []).some((s) => cleaned.includes(`[Source ${s.sourceId}`));

  return (
    <div className="space-y-1">
      {blocks.map((block, bi) => {
        const lines = block.split("\n");
        const isBullet =
          lines.length > 0 && lines.every((l) => /^\s*[*-]\s+/.test(l));
        const isNumbered =
          lines.length > 0 && lines.every((l) => /^\s*\d+\.\s+/.test(l));

        if (isBullet) {
          return (
            <ul key={bi} className="list-disc pl-5 space-y-1 my-1">
              {lines
                .filter((l) => l.trim())
                .map((l, i) => (
                  <li key={i}>
                    {renderBlockContent(
                      l.replace(/^\s*[*-]\s+/, ""),
                      sourceById,
                      onSeekToMs,
                      `b${bi}-${i}`
                    )}
                  </li>
                ))}
            </ul>
          );
        }

        if (isNumbered) {
          return (
            <ol key={bi} className="list-decimal pl-5 space-y-1 my-1">
              {lines
                .filter((l) => l.trim())
                .map((l, i) => (
                  <li key={i}>
                    {renderBlockContent(
                      l.replace(/^\s*\d+\.\s+/, ""),
                      sourceById,
                      onSeekToMs,
                      `n${bi}-${i}`
                    )}
                  </li>
                ))}
            </ol>
          );
        }

        return (
          <p key={bi} className="whitespace-pre-line my-1">
            {renderBlockContent(block, sourceById, onSeekToMs, `p${bi}`)}
          </p>
        );
      })}

      {!hasInline && (sources || []).length > 0 && (
        <div className="mt-2 pt-2 border-t border-gray-100">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1">
            Sources
          </p>
          <div className="flex flex-wrap gap-1.5">
            {sources.map((s) => (
              <CitationChip
                key={`fallback-${s.sourceId}`}
                source={s}
                onSeekToMs={onSeekToMs}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// sessionStorage preserves the resume ID across refresh, not visible messages.
// Backend context survives only while its in-memory process remains alive.
// This public UUID carries no identity claims and is not authenticated ownership.
function conversationIdFor(videoId, reset = false) {
  const key = `bytelearn:conversation:${videoId}`;
  const saved = reset ? null : sessionStorage.getItem(key);
  if (saved && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(saved)) return saved;
  const id = crypto.randomUUID();
  sessionStorage.setItem(key, id);
  return id;
}

const VideoConversationBody = ({ videoId, onSeekToMs }) => {
  const [messages, setMessages] = useState([]);
  const [inputVal, setInputVal] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);
  const scrollRef = useRef(null);
  const activeRequest = useRef(null);
  const nextMessageId = useRef(0);
  const [chatError, setChatError] = useState("");
  const [identityUnavailable, setIdentityUnavailable] = useState(false);

  useEffect(() => {
    // Desktop panel and mobile drawer can both be mounted for the same video.
    // Reset both before replacing their shared sessionStorage resume identifier.
    const onReset = ({ detail }) => {
      if (detail.videoId !== videoId) return;
      if (detail.phase === "abort") {
        activeRequest.current?.abort();
        activeRequest.current = null;
        setMessages([]);
        setInputVal("");
        setIsLoading(false);
        setChatError("");
        setIdentityUnavailable(true);
      } else {
        setIdentityUnavailable(Boolean(detail.error));
        setChatError(detail.error || "");
      }
    };
    window.addEventListener("bytelearn:conversation-reset", onReset);
    return () => {
      window.removeEventListener("bytelearn:conversation-reset", onReset);
      activeRequest.current?.abort();
      activeRequest.current = null;
    };
  }, [videoId]);

  const newConversation = () => {
    const announce = (detail) => window.dispatchEvent(new CustomEvent(
      "bytelearn:conversation-reset", { detail: { videoId, ...detail } }
    ));
    announce({ phase: "abort" });
    let error = "";
    try {
      conversationIdFor(videoId, true);
    } catch {
      // Never reuse the old stored ID if reset could not replace it.
      error = "Unable to start a conversation. Allow session storage and reload this page.";
    }
    announce({ phase: "ready", error });
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  const handleSend = async (e) => {
    e.preventDefault();
    const question = inputVal.trim();
    if (!question || activeRequest.current || identityUnavailable) return;

    const controller = new AbortController();
    activeRequest.current = controller;
    const current = () => activeRequest.current === controller && !controller.signal.aborted;
    let reader;
    const aiMessageId = `ai-${++nextMessageId.current}`;
    let conversationId;
    try {
      try {
        conversationId = conversationIdFor(videoId);
      } catch {
        setIdentityUnavailable(true);
        throw new Error("Unable to start a conversation. Allow session storage and reload this page.");
      }
      setChatError("");
      setInputVal("");
      setMessages((prev) => [
        ...prev,
        { role: "user", content: question },
        { id: aiMessageId, role: "ai", content: "" },
      ]);
      setIsLoading(true);
      const baseURL = axiosInstance.defaults.baseURL || "/api/v1";
      const response = await fetch(`${baseURL}/embeddings/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ videoId, question, conversationId }),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(response.status === 409
          ? "A question is already running for this conversation. Please try again shortly."
          : "Failed to get response. Please try again.");
      }
      reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let aiContent = "";
      let completed = false;
      const updateAnswer = (patch) => {
        if (current()) setMessages((prev) => prev.map((m) =>
          m.id === aiMessageId ? { ...m, ...patch } : m
        ));
      };

      while (!completed && current()) {
        const { value, done } = await reader.read();
        if (!current()) break;
        // Both UTF-8 code points and SSE frames can straddle network reads.
        buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
        let boundary;
        while (!completed && (boundary = /\r?\n\r?\n/.exec(buffer))) {
          const frame = buffer.slice(0, boundary.index);
          buffer = buffer.slice(boundary.index + boundary[0].length);
          let eventType = "message";
          const data = [];
          for (const line of frame.split(/\r?\n/)) {
            if (line.startsWith("event:")) eventType = line.slice(6).trim();
            else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
          }
          if (!["token", "done", "error"].includes(eventType)) continue;
          const parsed = JSON.parse(data.join("\n"));
          if (eventType === "token") {
            if (typeof parsed.text !== "string") throw new Error("Invalid answer stream");
            aiContent += parsed.text;
            updateAnswer({ content: aiContent });
          } else if (eventType === "done") {
            if (typeof parsed.answer !== "string") throw new Error("Invalid answer stream");
            completed = true;
            updateAnswer({ content: parsed.answer, sources: Array.isArray(parsed.sources) ? parsed.sources : [] });
          } else {
            throw new Error("Sorry, something went wrong. Please try again.");
          }
        }
        if (done && !completed) throw new Error("The answer stream ended early. Please try again.");
      }
    } catch (error) {
      if (current()) {
        // Replace the draft, so a failed stream cannot look like a complete answer.
        setMessages((prev) => prev.filter((m) => m.id !== aiMessageId));
        setChatError(error.message || "Unable to start a conversation.");
      }
    } finally {
      if (reader) {
        try { await reader.cancel(); } catch { /* The transport may already be closed. */ }
        reader.releaseLock();
      }
      if (activeRequest.current === controller) {
        activeRequest.current = null;
        setIsLoading(false);
      }
    }
  };

  const isNotCovered = (content) => {
    return (
      content.includes("I couldn't find a relevant answer in this video's transcript") ||
      content.includes("I couldn't find enough information in this video to answer that")
    );
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-4 py-2 bg-white border-b border-slate-200">
        <button type="button" onClick={newConversation}
          className="text-sm text-[#994d51] rounded-lg px-2 py-1 hover:bg-[#f3e7e8] focus:outline-none focus:ring-2 focus:ring-[#994d51]/50">
          New conversation
        </button>
      </div>
      <div ref={scrollRef} className="no-scrollbar flex-1 overflow-y-auto p-4 space-y-4 bg-[#fcf8f8]">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-3 p-6 text-center">
            <span className="w-16 h-16 bg-[#f3e7e8] rounded-full flex items-center justify-center shadow-sm">
              <Bot className="w-8 h-8 text-[#994d51]" />
            </span>
            <p className="font-medium text-lg text-[#1b0e0e]">Have any Questions?</p>
            <p className="text-sm">Get grounded, cited answers with one-click access to the exact moment in the video.</p>
          </div>
        ) : (
          messages.map((msg, idx) => (
            <div
              key={msg.id || idx}
              className={`flex w-full ${
                msg.role === "user" ? "justify-end" : "justify-start"
              }`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
                  msg.role === "user"
                    ? "bg-[#994d51] text-white rounded-br-sm shadow-sm"
                    : isNotCovered(msg.content)
                    ? "bg-orange-100 text-orange-800 border border-orange-200"
                    : "bg-[#f3e7e8] text-[#1b0e0e] rounded-bl-sm shadow-sm"
                }`}
              >
                {msg.role === "ai" && isNotCovered(msg.content) ? (
                  <div className="flex flex-col items-center justify-center py-2 space-y-2 text-center">
                    <SearchX className="w-7 h-7" />
                    <p className="font-medium">Not covered in this video</p>
                    <p className="text-xs opacity-80">Try rephrasing the question.</p>
                  </div>
                ) : msg.role === "ai" ? (
                  <>
                    <AnswerContent
                      content={msg.content}
                      sources={msg.sources}
                      onSeekToMs={onSeekToMs}
                    />
                    {!msg.content && isLoading && (
                      <span className="animate-pulse">...</span>
                    )}
                  </>
                ) : (
                  msg.content
                )}
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 bg-white border-t border-slate-200 sticky bottom-0 z-10 rounded-b-2xl">
        {chatError && <p role="alert" className="text-sm text-red-700 mb-2">{chatError}</p>}
        <form onSubmit={handleSend} className="flex gap-2">
          <input
            type="text"
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            placeholder="Ask a question..."
            className="flex-1 border border-slate-300 rounded-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#994d51]/50 focus:border-transparent bg-slate-50"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={!inputVal.trim() || isLoading || identityUnavailable}
            className="bg-[#994d51] text-white rounded-full px-4 py-2.5 text-sm font-medium hover:bg-[#7a3d41] disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-[#994d51]/50 shadow-sm flex items-center gap-1.5"
          >
            <Send className="w-4 h-4" />
            Send
          </button>
        </form>
      </div>
    </div>
  );
};

// Changing videos unmounts the old request and clears visible state. Returning
// to a video reuses its stored ID; no history retrieval endpoint is involved.
const VideoChatBody = (props) => <VideoConversationBody key={props.videoId} {...props} />;

export default VideoChatBody;
