import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getContinueWatching } from "../../api/progress.js";

const ContinueWatching = () => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const res = await getContinueWatching();
        const data = res?.data || res?.items || res || [];
        const list = Array.isArray(data) ? data : (Array.isArray(data?.videos) ? data.videos : []);
        setItems(list);
      } catch (e) {
        setError(typeof e === "string" ? e : e?.message || "Failed to load continue watching");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) {
    return <div className="max-w-5xl mx-auto bg-white shadow rounded-lg p-6 text-center text-gray-600">Loading...</div>;
  }

  if (error) {
    return (
      <div className="max-w-5xl mx-auto bg-white shadow rounded-lg p-6 text-center">
        <p className="text-red-600">{error}</p>
      </div>
    );
  }

  if (!items.length) {
    return (
      <div className="max-w-5xl mx-auto bg-white shadow rounded-lg p-6 text-center text-gray-700">
        Nothing to continue. Start watching some videos!
      </div>
    );
  }

  const toCard = (entry) => {
    // Try to normalize common shapes
    const v = entry?.videoDetails || entry?.video || entry;
    const percent = entry?.percent ?? entry?.progress ?? entry?.watchedPercent ?? 0;
    const id = v?._id || entry?.videoId || entry?._id;
    const title = v?.title || entry?.title || "Untitled";
    const thumbnail = v?.thumbnail || entry?.thumbnail;
    return { id, title, thumbnail, percent: Number(percent) || 0 };
  };

  const cards = items.map(toCard).filter((c) => c.id);

  return (
    <div className="max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-4">Continue Watching</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {cards.map((c) => (
          <Link key={c.id} to={`/videos/${c.id}`} className="bg-white rounded-lg shadow hover:shadow-md transition overflow-hidden">
            {c.thumbnail ? (
              <img src={c.thumbnail} alt={c.title} className="w-full h-36 object-cover" />
            ) : (
              <div className="w-full h-36 bg-gray-200" />
            )}
            <div className="p-3">
              <div className="font-medium text-gray-900 line-clamp-2">{c.title}</div>
              <div className="mt-2 h-2 w-full bg-gray-200 rounded">
                <div className="h-2 bg-indigo-600 rounded" style={{ width: `${Math.min(100, Math.max(0, c.percent))}%` }} />
              </div>
              <div className="mt-1 text-xs text-gray-600">{Math.min(100, Math.max(0, Math.round(c.percent)))}% watched</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
};

export default ContinueWatching;
