// Utilities for parsing and formatting durations consistently to HH:MM:SS

// Parse common duration strings to seconds: supports HH:MM:SS, MM:SS, and numeric seconds
export function parseDurationToSeconds(input) {
  if (input == null) return 0;
  if (typeof input === 'number' && Number.isFinite(input)) return Math.max(0, Math.floor(input));
  const s = String(input).trim();
  if (!s) return 0;

  // If strictly a number string, treat as seconds
  if (/^\d+(?:\.\d+)?$/.test(s)) {
    return Math.max(0, Math.floor(Number(s)));
  }

  const parts = s.split(':').map((p) => p.trim());
  if (parts.length === 3) {
    const [hh, mm, ss] = parts.map((p) => (p === '' ? '0' : p));
    const h = Number(hh);
    const m = Number(mm);
    const sec = Number(ss);
    if ([h, m, sec].every((n) => Number.isFinite(n) && n >= 0)) {
      return h * 3600 + m * 60 + Math.floor(sec);
    }
  } else if (parts.length === 2) {
    const [mm, ss] = parts.map((p) => (p === '' ? '0' : p));
    const m = Number(mm);
    const sec = Number(ss);
    if ([m, sec].every((n) => Number.isFinite(n) && n >= 0)) {
      return m * 60 + Math.floor(sec);
    }
  }

  // Fallback: try extracting numbers, otherwise 0
  const nums = s.match(/\d+/g);
  if (nums && nums.length) {
    try {
      // Heuristic: if 3+ numbers, treat as HH MM SS; if 2, MM SS; if 1, seconds
      if (nums.length >= 3) {
        const [hh, mm, ss] = nums.slice(-3).map((n) => Number(n));
        return (hh || 0) * 3600 + (mm || 0) * 60 + Math.floor(ss || 0);
      }
      if (nums.length === 2) {
        const [mm, ss] = nums.map((n) => Number(n));
        return (mm || 0) * 60 + Math.floor(ss || 0);
      }
      return Math.floor(Number(nums[0]) || 0);
    } catch (_) {}
  }
  return 0;
}

export function formatSecondsToHMS(totalSec) {
  const sec = Math.max(0, Math.floor(Number(totalSec) || 0));
  const hh = Math.floor(sec / 3600);
  const mm = Math.floor((sec % 3600) / 60);
  const ss = sec % 60;
  const H = String(hh).padStart(2, '0');
  const M = String(mm).padStart(2, '0');
  const S = String(ss).padStart(2, '0');
  return `${H}:${M}:${S}`;
}

// Convenience: convert an arbitrary duration input to HH:MM:SS
export function ensureHMS(input) {
  const seconds = parseDurationToSeconds(input);
  if (!seconds) return '00:00:00';
  return formatSecondsToHMS(seconds);
}
