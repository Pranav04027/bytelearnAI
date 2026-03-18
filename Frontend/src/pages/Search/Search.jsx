import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { searchVideos } from "../../api/videos.js";

const useQuery = () => new URLSearchParams(useLocation().search);

function highlight(text, q) {
  if (!q) return text;
  try {
    const parts = text.split(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "ig"));
    return parts.map((part, i) =>
      part.toLowerCase() === q.toLowerCase() ? (
        <mark key={i} className="bg-yellow-200 text-inherit">
          {part}
        </mark>
      ) : (
        <span key={i}>{part}</span>
      )
    );
  } catch {
    return text;
  }
}

const Search = () => {
  const query = useQuery();
  const [searchParams, setSearchParams] = useSearchParams();
  const q = (query.get("q") || "").trim();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [videos, setVideos] = useState([]);
  const [total, setTotal] = useState(0);
  const pageSize = 12;
  const pageParam = parseInt(searchParams.get("page") || "1", 10);
  const page = Number.isNaN(pageParam) || pageParam < 1 ? 1 : pageParam;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const res = await searchVideos({ query: q, page, limit: pageSize });
        const data = res && res.data && (res.results === undefined ? res.data : res);
        const container = data || res || {};
        const results = Array.isArray(container.results) ? container.results : [];
        const t = typeof container.total === "number" ? container.total : results.length;
        if (cancelled) return;
        setVideos(results);
        setTotal(t);
      } catch (e) {
        if (!cancelled) setError(typeof e === "string" ? e : e?.message || "Search failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [q, page]);

  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    next.set("q", q);
    next.set("page", String(page));
    setSearchParams(next, { replace: true });
  }, [q, page]);

  return (
    <div className="max-w-7xl mx-auto">
      <h1 className="text-xl font-semibold text-[#1b0e0e]">Search results (videos)</h1>
      <p className="text-sm text-[#994d51] mt-1">for "{q}"</p>

      {loading && <p className="mt-6 text-sm text-[#994d51]">Loading…</p>}
      {error && <p className="mt-6 text-sm text-red-600">{error}</p>}

      {!loading && !error && (
        <div className="mt-6">
          <h2 className="text-lg font-medium text-[#1b0e0e]">Videos ({total})</h2>
          {videos.length === 0 ? (
            <p className="text-sm text-[#994d51] mt-2">No matching videos.</p>
          ) : (
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {videos.map((v) => (
                <Link key={v._id || v.id} to={`/videos/${v._id || v.id}`} className="block rounded-xl bg-white hover:bg-white/90 transition shadow-sm hover:shadow-md p-3">
                  <div className="aspect-video w-full rounded-lg bg-[#ddd] overflow-hidden">
                    {v.thumbnail && (
                      <img src={v.thumbnail} alt={v.title} className="w-full h-full object-cover" />
                    )}
                  </div>
                  <div className="mt-2">
                    <h3 className="text-sm font-semibold text-[#1b0e0e] line-clamp-2">{highlight(v.title || "Untitled", q)}</h3>
                    {v.description && (
                      <p className="text-xs text-[#6b3b3d] mt-1 line-clamp-2">{v.description}</p>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
          <div className="mt-6 flex items-center justify-between">
            <button
              className="px-3 py-1.5 rounded border text-sm disabled:opacity-50"
              onClick={() => setSearchParams({ q, page: String(Math.max(1, page - 1)) })}
              disabled={page <= 1}
            >
              Prev
            </button>
            <div className="text-sm text-[#6b3b3d]">
              Page {page} • Showing {(videos.length && (page - 1) * pageSize + 1) || 0}-{(page - 1) * pageSize + videos.length} of {total}
            </div>
            <button
              className="px-3 py-1.5 rounded border text-sm disabled:opacity-50"
              onClick={() => setSearchParams({ q, page: String(page + 1) })}
              disabled={videos.length < pageSize || page * pageSize >= total}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Search;
