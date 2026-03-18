import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getMyBookmarks, removeBookmark } from "../../api/bookmarks.js";
import {
  getPlaylistBookmarks,
  removePlaylistBookmark,
} from "../../utils/playlistBookmarks.js";

// helpers for meta display
const timeAgo = (date) => {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  const diff = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diff < 60) return "just now";
  const mins = Math.floor(diff / 60);
  if (mins < 60) return `${mins} min${mins === 1 ? "" : "s"} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;
  const years = Math.floor(months / 12);
  return `${years} year${years === 1 ? "" : "s"} ago`;
};

const formatViews = (n) => {
  if (typeof n !== "number") return "0 views";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M views`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}K views`;
  return `${n} views`;
};

const Bookmarks = () => {
  const [items, setItems] = useState([]); // videos
  const [playlistItems, setPlaylistItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await getMyBookmarks();
      // Backend returns an array of Bookmark docs populated with video
      const raw = Array.isArray(res?.data) ? res.data : res?.data?.bookmarks || res?.data || [];
      const videos = raw
        .map((b) => b?.video || b)
        .filter(Boolean)
        .map((v) => ({
          ...v,
          videofile: v.videofile?.replace("http://", "https://"),
          thumbnail: v.thumbnail?.replace("http://", "https://"),
        }));
      setItems(videos);
      // load playlist bookmarks from localStorage
      setPlaylistItems(getPlaylistBookmarks());
    } catch (e) {
      setError(typeof e === "string" ? e : e?.message || "Failed to load bookmarks");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const onRemove = async (videoId) => {
    try {
      await removeBookmark(videoId);
      setItems((prev) => prev.filter((v) => v._id !== videoId));
    } catch (_) {}
  };

  const onRemovePlaylist = (playlistId) => {
    try {
      removePlaylistBookmark(playlistId);
      setPlaylistItems((prev) => prev.filter((p) => p._id !== playlistId));
    } catch (_) {}
  };

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header row */}
      <div className="flex flex-wrap justify-between gap-3 p-4">
        <p className="text-[#1b0e0e] tracking-light text-[32px] font-bold leading-tight min-w-72">Bookmarks</p>
      </div>

      <div className="bg-transparent">
        {loading && <div className="text-[#1b0e0e]/70 px-4">Loading...</div>}
        {error && <div className="text-red-600 px-4">{error}</div>}

        {!loading && !error && items.length === 0 && playlistItems.length === 0 && (
          <div className="text-[#1b0e0e]/70 px-4">No bookmarks yet.</div>
        )}

        {!loading && !error && items.length > 0 && (
          <div className="flex flex-col">
            {items.map((v) => (
              <div key={v._id} className="flex items-center gap-4 bg-[#fcf8f8] px-4 py-3 justify-between border-b border-[#f3e7e8]">
                <Link to={`/videos/${v._id}`} className="flex items-center gap-4 min-w-0">
                  <div
                    className="bg-center bg-no-repeat aspect-video bg-cover rounded-lg h-14 w-24 sm:w-32"
                    style={{ backgroundImage: `url('${v.thumbnail || ""}')` }}
                  />
                  <div className="flex flex-col justify-center min-w-0">
                    <p className="text-[#1b0e0e] text-base font-medium leading-normal line-clamp-1">{v.title}</p>
                    <p className="text-[#994d51] text-sm font-normal leading-normal line-clamp-2">
                      {timeAgo(v.createdAt)} · {formatViews(v.views)}
                    </p>
                  </div>
                </Link>
                <div className="shrink-0">
                  <button
                    className="flex min-w-[84px] max-w-[480px] cursor-pointer items-center justify-center overflow-hidden rounded-lg h-8 px-4 bg-[#f3e7e8] text-[#1b0e0e] text-sm font-medium leading-normal w-fit hover:shadow-sm"
                    onClick={() => onRemove(v._id)}
                  >
                    <span className="truncate">Remove</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Playlist bookmarks */}
        {!loading && !error && playlistItems.length > 0 && (
          <div className="mt-8">
            <p className="text-[#1b0e0e] tracking-light text-[22px] font-bold leading-tight px-4 mb-2">Bookmarked Playlists</p>
            <div className="flex flex-col">
              {playlistItems.map((p) => (
                <div key={p._id} className="flex items-center gap-4 bg-[#fcf8f8] px-4 py-3 justify-between border-b border-[#f3e7e8]">
                  <Link to={`/playlists/${p._id}`} className="flex items-center gap-4 min-w-0">
                    <div className="flex flex-col justify-center min-w-0">
                      <p className="text-[#1b0e0e] text-base font-medium leading-normal line-clamp-1">{p.name}</p>
                      <p className="text-[#994d51] text-sm font-normal leading-normal line-clamp-2">{p.description}</p>
                    </div>
                  </Link>
                  <div className="shrink-0">
                    <button
                      className="flex min-w-[84px] items-center justify-center overflow-hidden rounded-lg h-8 px-4 bg-[#f3e7e8] text-[#1b0e0e] text-sm font-medium w-fit hover:shadow-sm"
                      onClick={() => onRemovePlaylist(p._id)}
                    >
                      <span className="truncate">Remove</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Bookmarks;
