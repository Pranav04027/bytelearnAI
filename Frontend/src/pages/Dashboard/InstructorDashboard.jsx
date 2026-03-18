import { useEffect, useState } from "react";
import useAuth from "../../hooks/useAuth.js";
import { getInstructorStats, getInstructorVideos } from "../../api/instructor.js";
import { Link } from "react-router-dom";

const Stat = ({ label, value }) => (
  <div className="p-4 bg-white rounded-lg shadow">
    <div className="text-sm text-gray-600">{label}</div>
    <div className="text-2xl font-semibold text-gray-900">{value ?? "-"}</div>
  </div>
);

const VideoItem = ({ v }) => (
  <Link to={`/videos/${v._id}`} className="block bg-white rounded-lg shadow hover:shadow-md transition p-3">
    <div className="flex items-center gap-3">
      {v.thumbnail ? (
        <img src={v.thumbnail?.replace('http://', 'https://')} alt={v.title} className="w-24 h-16 object-cover rounded" />
      ) : (
        <div className="w-24 h-16 bg-gray-200 rounded" />
      )}
      <div>
        <div className="text-sm font-semibold text-gray-900 line-clamp-2">{v.title}</div>
        <div className="text-xs text-gray-600">{v.views ?? 0} views</div>
      </div>
    </div>
  </Link>
);

const InstructorDashboard = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const s = await getInstructorStats();
        setStats(s?.data || s);
        const v = await getInstructorVideos(user?._id);
        const arr = Array.isArray(v?.data) ? v.data : (v?.videos || v?.data?.videos || []);
        setVideos(arr);
      } catch (e) {
        setError(typeof e === 'string' ? e : e?.message || 'Failed to load instructor dashboard');
      } finally {
        setLoading(false);
      }
    };
    if (user?._id) load();
  }, [user?._id]);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Instructor Dashboard</h1>
        <Link to="/videos/upload" className="px-3 py-2 bg-indigo-600 text-white rounded">Upload Video</Link>
      </div>

      {loading && <div className="bg-white shadow rounded p-6 text-gray-600">Loading...</div>}
      {error && <div className="bg-white shadow rounded p-6 text-red-600">{error}</div>}

      {!loading && !error && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Stat label="Total Videos" value={stats?.totalVideos} />
            <Stat label="Total Views" value={stats?.totalViews} />
            <Stat label="Subscribers" value={stats?.subscribers} />
            <Stat label="Avg Watch %" value={stats?.avgWatchPercent} />
          </div>

          <div className="space-y-3">
            <h2 className="text-lg font-semibold text-gray-900">Your Videos</h2>
            {videos.length === 0 ? (
              <div className="bg-white p-4 rounded text-gray-600">No videos yet.</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {videos.map((v) => (
                  <VideoItem key={v._id} v={v} />
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default InstructorDashboard;
