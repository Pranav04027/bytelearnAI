import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { getUserPlaylists } from "../../api/playlists.js";
import useAuth from "../../hooks/useAuth.js";
import {
  addPlaylistBookmark,
  removePlaylistBookmark,
  isPlaylistBookmarked,
} from "../../utils/playlistBookmarks.js";

const UserPlaylists = () => {
  const { userId } = useParams();
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [bookmarked, setBookmarked] = useState({}); // playlistId -> bool

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const res = await getUserPlaylists(userId);
        const data = Array.isArray(res?.data) ? res.data : res?.data?.playlists || res?.data || [];
        setItems(data);
        // derive bookmarked state
        const bm = {};
        data.forEach((p) => {
          if (p?._id) bm[p._id] = isPlaylistBookmarked(p._id);
        });
        setBookmarked(bm);
      } catch (e) {
        setError(typeof e === "string" ? e : e?.message || "Failed to load playlists");
      } finally {
        setLoading(false);
      }
    };
    if (userId) load();
  }, [userId]);

  const onToggleBookmark = (p) => {
    if (!p?._id) return;
    const isMine = user && (p.userId === user._id || p.user === user._id);
    if (isMine) return; // do not allow bookmarking own playlist
    if (bookmarked[p._id]) {
      removePlaylistBookmark(p._id);
      setBookmarked((prev) => ({ ...prev, [p._id]: false }));
    } else {
      addPlaylistBookmark({
        _id: p._id,
        name: p.name,
        description: p.description,
        ownerId: p.userId || p.user || null,
        ownerUsername: p.username || p.user?.username || null,
      });
      setBookmarked((prev) => ({ ...prev, [p._id]: true }));
    }
  };

  return (
    <div className="max-w-5xl mx-auto p-4">
      <div className="bg-white/70 shadow-sm rounded-xl p-6">
        <h1 className="text-[#1b0e0e] tracking-light text-[28px] md:text-[32px] font-bold leading-tight mb-4">User Playlists</h1>

        {loading && <div className="text-[#1b0e0e]/70">Loading...</div>}
        {error && <div className="text-red-600">{error}</div>}

        {!loading && !error && items.length === 0 && (
          <div className="text-[#1b0e0e]/70">No playlists yet.</div>
        )}

        {!loading && !error && items.length > 0 && (
          <div className="space-y-3">
            {items.map((p) => {
              const isMine = user && (p.userId === user._id || p.user === user._id);
              return (
                <div key={p._id} className="p-3 rounded-lg bg-white/70 shadow-sm flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium text-[#1b0e0e]">{p.name}</div>
                    <div className="text-sm text-[#1b0e0e]/70">{p.description}</div>
                  </div>
                  {!isMine && (
                    <button
                      onClick={() => onToggleBookmark(p)}
                      className="flex items-center justify-center rounded-lg h-9 px-4 bg-[#f3e7e8] text-[#1b0e0e] text-sm font-medium hover:shadow-sm"
                    >
                      {bookmarked[p._id] ? "Unbookmark" : "Bookmark"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default UserPlaylists;
