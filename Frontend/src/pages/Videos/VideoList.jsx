import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { searchVideos } from "../../api/videos.js";
import { getQuizExistsByVideoId } from "../../api/quizzes.js";

const Chip = ({ children }) => (
  <span className="inline-flex items-center gap-1 rounded-full bg-[#f3e7e8] text-[#1b0e0e] px-2 py-0.5 text-[11px] font-medium">
    {children}
  </span>
);

const VideoCard = ({ video }) => {
  const [quizExists, setQuizExists] = useState(undefined);
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const exists = await getQuizExistsByVideoId(video._id);
        if (mounted) setQuizExists(!!exists);
      } catch {
        if (mounted) setQuizExists(false);
      }
    })();
    return () => { mounted = false; };
  }, [video._id]);

  return (
    <Link to={`/videos/${video._id}`} className="block rounded-xl bg-white/70 hover:bg-white transition shadow-sm hover:shadow-md p-3">
      <img src={video.thumbnail} alt={video.title} className="w-full h-44 object-cover rounded-lg" />
      <div className="mt-3 space-y-2">
        <h3 className="text-[15px] font-semibold text-[#1b0e0e] leading-snug line-clamp-2">{video.title}</h3>
        <p className="text-[12px] text-[#1b0e0e]/70 line-clamp-2">{video.description}</p>
        <div className="flex items-center gap-2 flex-wrap">
          <Chip>{video.category}</Chip>
          <Chip>{video.difficulty}</Chip>
          {quizExists === undefined ? null : quizExists ? (
            <span className="inline-block px-3 py-1 rounded-full text-xs bg-green-100 text-green-700 font-semibold">Quiz available</span>
          ) : (
            <span className="inline-block px-3 py-1 rounded-full text-xs bg-[#f3e7e8] text-[#1b0e0e]">No quiz</span>
          )}
        </div>
      </div>
    </Link>
  );
};

const VideoList = () => {
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [total, setTotal] = useState(0);
  const [searchParams, setSearchParams] = useSearchParams();

  const limit = 12;
  const page = useMemo(() => {
    const p = parseInt(searchParams.get("page") || "1", 10);
    return Number.isNaN(p) || p < 1 ? 1 : p;
  }, [searchParams]);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const res = await searchVideos({ query: undefined, page, limit });
        const results = res?.data?.results || [];
        const t = res?.data?.total ?? results.length;
        if (!mounted) return;
        setVideos(results);
        setTotal(typeof t === "number" ? t : 0);
      } catch (e) {
        if (!mounted) return;
        setError(typeof e === "string" ? e : e?.message || "Failed to load videos");
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => { mounted = false; };
  }, [page]);

  const totalPages = Math.max(1, Math.ceil(total / limit));
  const goToPage = (p) => {
    const next = Math.min(Math.max(1, p), totalPages || 1);
    setSearchParams(next === 1 ? {} : { page: String(next) });
  };

  return (
    <div className="max-w-7xl mx-auto">
      <div className="p-4">
        <div className="flex flex-wrap justify-between gap-3">
          <p className="text-[#1b0e0e] tracking-light text-[32px] font-bold leading-tight">Videos</p>
        </div>

        {loading && (
          <div className="text-center py-12 text-[#1b0e0e]/70">Loading videos...</div>
        )}

        {error && !loading && (
          <div className="text-center py-12 text-red-600">{error}</div>
        )}

        {!loading && !error && videos.length === 0 && (
          <div className="text-center py-12 text-[#1b0e0e]/70">No videos yet.</div>
        )}

        {!loading && !error && videos.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 mt-4">
            {videos.map((v) => (
              <VideoCard key={v._id} video={v} />
            ))}
          </div>
        )}

        {/* Pagination controls */}
        {!loading && !error && totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 mt-6">
            <button
              className="h-9 px-3 rounded-lg bg-[#f3e7e8] text-[#1b0e0e] text-sm font-medium disabled:opacity-50"
              onClick={() => goToPage(page - 1)}
              disabled={page <= 1}
            >
              Prev
            </button>
            <span className="text-[#1b0e0e]/80 text-sm">
              Page {Math.min(page, totalPages)} of {totalPages}
            </span>
            <button
              className="h-9 px-3 rounded-lg bg-[#f3e7e8] text-[#1b0e0e] text-sm font-medium disabled:opacity-50"
              onClick={() => goToPage(page + 1)}
              disabled={page >= totalPages}
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default VideoList;
