import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import axiosInstance from "../api/axios.js";
import { formatMsToTimestamp } from "../utils/time.js";

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
      className="inline-flex items-center gap-1 mx-0.5 my-0.5 align-middle text-[11px] font-mono bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-full px-2 py-0.5 transition-colors"
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

const VideoChatDrawer = ({ videoId, isOpen, onClose, onSeekToMs }) => {
  const [messages, setMessages] = useState([]);
  const [inputVal, setInputVal] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const handleSend = async (e) => {
    e.preventDefault();
    const question = inputVal.trim();
    if (!question || isLoading) return;

    setInputVal("");
    setMessages((prev) => [...prev, { role: "user", content: question }]);
    setIsLoading(true);

    const abortController = new AbortController();

    try {
      const aiMessageId = Date.now();
      setMessages((prev) => [
        ...prev,
        { id: aiMessageId, role: "ai", content: "" },
      ]);

      const baseURL = axiosInstance.defaults.baseURL || "/api/v1";
      const url = `${baseURL}/embeddings/answer`;

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ videoId, question }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        throw new Error("Failed to get response");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let aiContent = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const events = chunk.split("\n\n");

        for (const eventStr of events) {
          if (!eventStr.trim()) continue;
          const lines = eventStr.split("\n");
          let eventType = "message";
          let eventData = "";

          for (const line of lines) {
            if (line.startsWith("event:")) {
              eventType = line.replace("event:", "").trim();
            } else if (line.startsWith("data:")) {
              eventData = line.replace("data:", "").trim();
            }
          }

          if (eventType === "token") {
            try {
              const parsed = JSON.parse(eventData);
              aiContent += parsed.text;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === aiMessageId ? { ...m, content: aiContent } : m
                )
              );
            } catch (e) {
              // ignore parse errors for partial chunks
            }
          } else if (eventType === "done") {
            try {
              const parsed = JSON.parse(eventData);
              const doneSources = Array.isArray(parsed?.sources)
                ? parsed.sources
                : [];
              if (doneSources.length > 0) {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === aiMessageId ? { ...m, sources: doneSources } : m
                  )
                );
              }
            } catch (_) {
              // ignore parse errors for partial chunks
            }
            break;
          } else if (eventType === "error") {
            throw new Error("Stream error");
          }
        }
      }
    } catch (error) {
      console.error("Chat error:", error);
      setMessages((prev) => [
        ...prev,
        { role: "ai", content: "Sorry, something went wrong. Please try again." },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const isNotCovered = (content) => {
    return content.includes("I couldn't find a relevant answer in this video's transcript");
  };

  return createPortal(
    <>
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/20 z-[50] transition-opacity"
          onClick={onClose}
        />
      )}
      <div
        className={`fixed top-0 right-0 h-full w-full md:w-[400px] bg-white shadow-2xl transform transition-transform duration-300 z-[60] flex flex-col ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-4 py-4 border-b">
          <h2 className="text-lg font-bold text-gray-800">Ask the Video</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 bg-gray-100 rounded-full p-2"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-500 space-y-2">
              <span className="text-4xl">🤖</span>
              <p>Ask me anything about this video!</p>
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
                  className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${
                    msg.role === "user"
                      ? "bg-indigo-600 text-white rounded-br-none"
                      : isNotCovered(msg.content)
                      ? "bg-orange-100 text-orange-800 border border-orange-200"
                      : "bg-white text-gray-800 border rounded-bl-none shadow-sm"
                  }`}
                >
                  {msg.role === "ai" && isNotCovered(msg.content) ? (
                    <div className="flex flex-col items-center justify-center py-2 space-y-2 text-center">
                      <span className="text-2xl">🤷‍♂️</span>
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

        <div className="p-4 bg-white border-t">
          <form onSubmit={handleSend} className="flex gap-2">
            <input
              type="text"
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              placeholder="Ask a question..."
              className="flex-1 border rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={!inputVal.trim() || isLoading}
              className="bg-indigo-600 text-white rounded-full px-4 py-2 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Send
            </button>
          </form>
        </div>
      </div>
    </>,
    document.body
  );
};

export default VideoChatDrawer;
