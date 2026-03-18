import { useEffect, useState } from "react";
import { on } from "../utils/emitter.js";

const Toast = ({ t, onClose }) => {
  const color = t.type === "error" ? "bg-red-600" : t.type === "success" ? "bg-green-600" : "bg-gray-900";
  return (
    <div className={`${color} text-white px-4 py-2 rounded shadow flex items-center gap-3`}> 
      <span className="text-sm">{t.message}</span>
      <button onClick={onClose} className="text-white/80 hover:text-white text-xs">Dismiss</button>
    </div>
  );
};

export default function ToastHost() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    const off = on("toast", (payload) => {
      const id = Math.random().toString(36).slice(2);
      setToasts((prev) => [...prev, { id, ...payload }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, payload?.duration || 3500);
    });
    return () => off && off();
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2">
      {toasts.map((t) => (
        <Toast key={t.id} t={t} onClose={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))} />
      ))}
    </div>
  );
}
