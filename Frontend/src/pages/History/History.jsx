import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getWatchHistory } from "../../api/auth.js";

const Card = ({ v }) => (
  <Link to={`/videos/${v._id}`} className="block bg-white rounded-lg shadow hover:shadow-md transition p-3">
    {v.thumbnail ? (
      <img src={v.thumbnail?.replace('http://', 'https://')} alt={v.title} className="w-full h-40 object-cover rounded" />
    ) : (
      <div className="w-full h-40 bg-gray-200 rounded" />
    )}
    <div className="mt-3">
      <h3 className="text-sm font-semibold text-gray-900 line-clamp-2">{v.title}</h3>
      <p className="text-xs text-gray-500 mt-1 line-clamp-2">{v.description}</p>
    </div>
  </Link>
);

const History = () => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const res = await getWatchHistory();
        // Accept multiple backend shapes:
        // - ApiResponse { data: { listOfWatchedVideos: [...] } }
        // - ApiResponse { data: [...] }
        // - { history: [...] }
        const rawList =
          (Array.isArray(res?.data) ? res?.data :
            Array.isArray(res?.data?.listOfWatchedVideos) ? res?.data?.listOfWatchedVideos :
            Array.isArray(res?.data?.history) ? res?.data?.history :
            Array.isArray(res?.history) ? res?.history :
            []);

        const videos = rawList
          .map((x) => x?.videoDetails || x)
          .filter(Boolean)
          .map((v) => ({
          ...v,
          videofile: v.videofile?.replace('http://', 'https://'),
          thumbnail: v.thumbnail?.replace('http://', 'https://'),
        }));
        setItems(videos);
      } catch (e) {
        setError(typeof e === "string" ? e : e?.message || "Failed to load history");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  return (
    <div className="max-w-7xl mx-auto">
      <div className="bg-white shadow rounded-lg p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Watch History</h1>

        {loading && <div className="text-gray-600">Loading...</div>}
        {error && <div className="text-red-600">{error}</div>}

        {!loading && !error && items.length === 0 && (
          <div className="text-gray-600">No watch history.</div>
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

export default History;
