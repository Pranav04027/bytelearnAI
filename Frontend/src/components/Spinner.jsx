export default function Spinner({ className = "" }) {
  return (
    <div className={`animate-pulse text-gray-500 ${className}`} role="status" aria-live="polite">
      Loading...
    </div>
  );
}
