import { createPortal } from "react-dom";
import VideoChatBody from "./VideoChatBody.jsx";

const VideoChatDrawer = ({ videoId, isOpen, onClose, onSeekToMs }) => {
  return createPortal(
    <>
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/20 z-[50] transition-opacity"
          onClick={onClose}
        />
      )}
      <div
        className={`fixed top-0 right-0 h-dvh w-full md:w-[400px] bg-white shadow-2xl transform transition-transform duration-300 z-[60] flex flex-col ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-4 py-4 border-b border-slate-200">
          <h2 className="text-lg font-bold text-[#1b0e0e]">Ask About the Lesson</h2>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-[#1b0e0e] bg-slate-100 hover:bg-slate-200 rounded-full p-2 transition-colors focus:outline-none focus:ring-2 focus:ring-[#994d51]/50"
          >
            ✕
          </button>
        </div>

        <VideoChatBody videoId={videoId} onSeekToMs={onSeekToMs} />
      </div>
    </>,
    document.body
  );
};

export default VideoChatDrawer;
