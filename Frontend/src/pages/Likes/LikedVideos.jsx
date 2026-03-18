import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getLikedVideos } from "../../api/likes.js";

const Card = ({ v }) => (
  <Link to={`/videos/${v._id}`} className="block bg-white rounded-lg shadow hover:shadow-md transition p-3">
    <img src={v.thumbnail?.replace('http://', 'https://')} alt={v.title} className="w-full h-40 object-cover rounded" />
    <div className="mt-3">
      <h3 className="text-sm font-semibold text-gray-900 line-clamp-2">{v.title}</h3>
      <p className="text-xs text-gray-500 mt-1 line-clamp-2">{v.description}</p>
    </div>
  </Link>
);

const LikedVideos = () => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const res = await getLikedVideos();
        // Backend returns array of likes each with videoDetails; normalize to array of videos
        const raw = Array.isArray(res?.data) ? res.data : (res?.data?.likedVideos || []);
        const videos = raw.map((x) => x?.videoDetails || x).filter(Boolean).map((v) => ({
          ...v,
          videofile: v.videofile?.replace('http://', 'https://'),
          thumbnail: v.thumbnail?.replace('http://', 'https://'),
        }));
        setItems(videos);
      } catch (e) {
        setError(typeof e === "string" ? e : e?.message || "Failed to load liked videos");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  return (
    <div className="max-w-7xl mx-auto">
      <div className="bg-white shadow rounded-lg p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Liked Videos</h1>

        {loading && <div className="text-gray-600">Loading...</div>}
        {error && <div className="text-red-600">{error}</div>}

        {!loading && !error && items.length === 0 && (
          <div className="text-gray-600">No liked videos yet.</div>
        )}

        {!loading && !error && items.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {items.map((v) => (
              <Card key={v._id} v={v} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default LikedVideos;
