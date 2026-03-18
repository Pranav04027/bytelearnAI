import { useEffect, useState } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { getMyPlaylists, createPlaylist, addVideoToPlaylist } from "../../api/playlists.js";

const useQuery = () => new URLSearchParams(useLocation().search);

const MyPlaylists = () => {
  const query = useQuery();
  const navigate = useNavigate();
  const addVideoId = query.get("addVideo"); // optional: if provided, allow adding this video to selected playlist

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await getMyPlaylists();
      const data = Array.isArray(res?.data) ? res.data : res?.data?.playlists || res?.data || [];
      setItems(data);
    } catch (e) {
      setError(typeof e === "string" ? e : e?.message || "Failed to load playlists");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const onCreate = async () => {
    if (!name.trim() || !description.trim()) return;
    setCreating(true);
    try {
      await createPlaylist({ name: name.trim(), description: description.trim(), videos: [] });
      setName("");
      setDescription("");
      await load();
    } catch (e) {
      alert(typeof e === "string" ? e : e?.message || "Failed to create playlist");
    } finally {
      setCreating(false);
    }
  };

  const onAddVideo = async (playlistId) => {
    if (!addVideoId) return;
    try {
      await addVideoToPlaylist(playlistId, addVideoId);
      alert("Video added to playlist");
      navigate("/playlists");
    } catch (e) {
      alert(typeof e === "string" ? e : e?.message || "Failed to add video to playlist");
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-white shadow rounded-lg p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">My Playlists</h1>

        {/* Create */}
        <div className="mb-6 grid grid-cols-1 md:grid-cols-3 gap-2">
          <input
            placeholder="Playlist name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="border rounded p-2 text-sm"
          />
          <input
            placeholder="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="border rounded p-2 text-sm"
          />
          <button
            onClick={onCreate}
            disabled={creating}
            className="px-4 py-2 bg-indigo-600 text-white rounded disabled:opacity-50"
          >
            {creating ? "Creating..." : "Create"}
          </button>
        </div>

        {loading && <div className="text-gray-600">Loading...</div>}
        {error && <div className="text-red-600">{error}</div>}

        {!loading && !error && items.length === 0 && (
          <div className="text-gray-600">No playlists yet.</div>
        )}

        {!loading && !error && items.length > 0 && (
          <div className="space-y-3">
            {items.map((p) => (
              <div key={p._id} className="p-3 border rounded flex items-center justify-between">
                <Link to={`/playlists/${p._id}`} className="flex-1 mr-3">
                  <div className="font-medium text-gray-900 hover:underline">{p.name}</div>
                  <div className="text-sm text-gray-600">{p.description}</div>
                </Link>
                {addVideoId && (
                  <button
                    onClick={() => onAddVideo(p._id)}
                    className="px-3 py-1 text-sm bg-green-600 text-white rounded"
                  >
                    Add Video
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default MyPlaylists;
