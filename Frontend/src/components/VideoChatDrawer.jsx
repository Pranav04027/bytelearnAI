import React, { useState, useRef, useEffect } from "react";
import axiosInstance from "../api/axios.js";

const VideoChatDrawer = ({ videoId, isOpen, onClose }) => {
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

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/20 z-40 transition-opacity"
          onClick={onClose}
        />
      )}
      <div
        className={`fixed top-0 right-0 h-full w-full md:w-[400px] bg-white shadow-2xl transform transition-transform duration-300 z-50 flex flex-col ${
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
                  ) : (
                    msg.content
                  )}
                  {msg.role === "ai" && !msg.content && isLoading && (
                    <span className="animate-pulse">...</span>
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
    </>
  );
};

export default VideoChatDrawer;
