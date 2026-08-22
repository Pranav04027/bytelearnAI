import { useEffect, useState, useRef } from "react";
import { Info, AlertTriangle, XCircle, CheckCircle2, Bell } from "lucide-react";
import { on } from "../utils/emitter.js";

const TYPE_MAP = {
  error: { Icon: XCircle, color: "bg-red-600" },
  success: { Icon: CheckCircle2, color: "bg-green-600" },
  warning: { Icon: AlertTriangle, color: "bg-amber-500" },
  info: { Icon: Info, color: "bg-gray-900" },
};

const Toast = ({ t, onClose }) => {
  const { Icon, color } = TYPE_MAP[t.type] || { Icon: Bell, color: "bg-gray-900" };
  return (
    <div className={`${color} text-white px-4 py-2 rounded shadow flex items-center gap-3`}>
      <Icon className="w-5 h-5 shrink-0" />
      <span className="text-sm">{t.message}</span>
      <button onClick={onClose} className="text-white/80 hover:text-white text-xs ml-auto pl-2">Dismiss</button>
    </div>
  );
};

export default function ToastHost() {
  const [toasts, setToasts] = useState([]);
  const lastRef = useRef({ message: null, time: 0 });

  useEffect(() => {
    const off = on("toast", (payload) => {
      const msg = payload?.message;
      const now = Date.now();
      const windowMs = payload?.duration || 3500;
      // Suppress identical consecutive messages within the toast's lifetime
      // (e.g. repeated rate-limit/429 errors from rapid retries).
      if (msg && msg === lastRef.current.message && now - lastRef.current.time < windowMs) {
        return;
      }
      lastRef.current = { message: msg, time: now };

      const id = Math.random().toString(36).slice(2);
      setToasts((prev) => [...prev, { id, ...payload }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, windowMs);
    });
    return () => off && off();
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-20 right-4 z-[60] space-y-2">
      {toasts.map((t) => (
        <Toast key={t.id} t={t} onClose={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))} />
      ))}
    </div>
  );
}
