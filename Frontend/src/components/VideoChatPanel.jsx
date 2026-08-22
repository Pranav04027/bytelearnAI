import React from "react";
import { Bot, Loader2, AlertCircle } from "lucide-react";
import VideoChatBody from "./VideoChatBody.jsx";

const VideoChatPanel = ({ videoId, status, onSeekToMs }) => {
  const isReady = status === "READY";

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col h-full">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200 bg-[#fcf8f8] rounded-t-2xl">
        <span className="w-9 h-9 rounded-full bg-[#994d51] text-white flex items-center justify-center shadow-sm shrink-0">
          <Bot className="w-5 h-5" />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-[#1b0e0e] leading-tight">
            Ask About the Lesson
          </h2>
          <p className="text-[11px] text-slate-500 leading-tight truncate">
            RAG based AI assistant
          </p>
        </div>
      </div>

      <div className="flex-1 min-h-0">
        {!isReady ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-3 p-6 text-center">
            {status === "FAILED" ? (
              <>
                <AlertCircle className="w-10 h-10 text-red-500" />
                <p className="font-medium text-[#1b0e0e]">AI features unavailable</p>
                <p className="text-sm">
                  This video's transcript couldn't be processed.
                </p>
              </>
            ) : (
              <>
                <Loader2 className="w-10 h-10 text-[#994d51] animate-spin" />
                <p className="font-medium text-[#1b0e0e]">
                  {status === "TRANSCRIBED"
                    ? "Generating embeddings…"
                    : "Transcribing video…"}
                </p>
                <p className="text-sm">The AI assistant will be ready shortly.</p>
              </>
            )}
          </div>
        ) : (
          <VideoChatBody videoId={videoId} onSeekToMs={onSeekToMs} />
        )}
      </div>
    </div>
  );
};

export default VideoChatPanel;
