import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { getMyPlaylists } from "../../api/playlists.js";
import useAuth from "../../hooks/useAuth.js";

const PlaylistDetail = () => {
  const { playlistId } = useParams();
  const { user } = useAuth();
  const [playlist, setPlaylist] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const res = await getMyPlaylists();
        const all = Array.isArray(res?.data) ? res.data : res?.data?.playlists || res?.data || [];
        const found = all.find((p) => p?._id === playlistId);
        setPlaylist(found || null);
        if (!found) {
          setError("Playlist not found");
        }
      } catch (e) {
        setError(typeof e === "string" ? e : e?.message || "Failed to load playlist");
      } finally {
        setLoading(false);
      }
    };
    if (playlistId) load();
  }, [playlistId]);

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto bg-white shadow rounded-lg p-6 text-center text-gray-600">Loading...</div>
    );
  }

  if (error || !playlist) {
    return (
      <div className="max-w-5xl mx-auto bg-white shadow rounded-lg p-6">
        <div className="mb-4">
          <Link to="/playlists" className="text-indigo-600 hover:text-indigo-700">← Back to My Playlists</Link>
        </div>
        <p className="text-red-600">{error || "Playlist not found"}</p>
      </div>
    );
  }

  const videos = Array.isArray(playlist.videos) ? playlist.videos : [];

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="bg-white shadow rounded-lg p-6">
        <div className="mb-4">
          <Link to="/playlists" className="text-indigo-600 hover:text-indigo-700">← Back to My Playlists</Link>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">{playlist.name}</h1>
        <p className="mt-2 text-gray-700">{playlist.description}</p>
        <div className="mt-3 text-sm text-gray-600">
          Owner: <span className="text-gray-900">@{user?.username}</span>
        </div>
        <div className="mt-1 text-sm text-gray-600">
          Videos: <span className="text-gray-900">{videos.length}</span>
        </div>
      </div>

      <div className="bg-white shadow rounded-lg p-4">
        {videos.length === 0 ? (
          <div className="text-gray-600">No videos in this playlist yet.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {videos.map((v) => {
              const vid = typeof v === "string" ? { _id: v } : v || {};
              const link = vid?._id ? `/videos/${vid._id}` : undefined;
              return (
                <div key={vid._id || Math.random()} className="border rounded overflow-hidden">
                  {vid.thumbnail ? (
                    <img src={vid.thumbnail} alt={vid.title || "Video"} className="w-full h-40 object-cover" />
                  ) : (
                    <div className="w-full h-40 bg-gray-200" />
                  )}
                  <div className="p-3">
                    <div className="font-medium text-gray-900 line-clamp-2">{vid.title || vid._id || "Untitled"}</div>
                    <div className="text-xs text-gray-600 mt-1 line-clamp-2">{vid.description || ""}</div>
                    {link && (
                      <Link to={link} className="inline-block mt-2 text-sm text-indigo-600 hover:text-indigo-700">Open video</Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default PlaylistDetail;


