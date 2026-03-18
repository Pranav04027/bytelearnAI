import { useEffect, useMemo, useState } from "react";
import useAuth from "../../hooks/useAuth.js";
import { getInstructorStats, getInstructorVideos, getInstructorWatchStats, getLikesByVideoIds } from "../../api/instructor.js";
import { ensureHMS, formatSecondsToHMS } from "../../utils/time.js";

const Dashboard = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [statsError, setStatsError] = useState("");
  const [videos, setVideos] = useState([]);
  const [loadingVideos, setLoadingVideos] = useState(false);
  const [videosError, setVideosError] = useState("");
  const [watchStats, setWatchStats] = useState(null);
  const [loadingWatch, setLoadingWatch] = useState(false);
  const [watchError, setWatchError] = useState("");
  const [likesMap, setLikesMap] = useState({});
  const [loadingLikes, setLoadingLikes] = useState(false);
  const [likesError, setLikesError] = useState("");

  // Normalize possibly aggregated values coming from backend (arrays/objects) into numbers
  const num = (val, key) => {
    if (typeof val === 'number') return val;
    if (Array.isArray(val)) {
      const first = val[0];
      if (first && typeof first[key] === 'number') return first[key];
    }
    if (val && typeof val === 'object' && typeof val[key] === 'number') return val[key];
    const n = Number(val);
    return Number.isFinite(n) ? n : 0;
  };

  useEffect(() => {
    const fetchStats = async () => {
      if (user?.role !== 'instructor') return;
      setLoadingStats(true);
      setStatsError("");
      try {
        const res = await getInstructorStats();
        setStats(res?.data || res);
      } catch (e) {
        setStatsError(typeof e === 'string' ? e : e?.message || 'Failed to load stats');
      } finally {
        setLoadingStats(false);
      }
    };
    fetchStats();
  }, [user?.role]);

  useEffect(() => {
    const fetchWatch = async () => {
      if (user?.role !== 'instructor') return;
      setLoadingWatch(true);
      setWatchError("");
      try {
        const res = await getInstructorWatchStats();
        setWatchStats(res?.data || res);
      } catch (e) {
        setWatchError(typeof e === 'string' ? e : e?.message || 'Failed to load watch stats');
      } finally {
        setLoadingWatch(false);
      }
    };
    fetchWatch();
  }, [user?.role]);

  useEffect(() => {
    const fetchVideos = async () => {
      if (user?.role !== 'instructor' || !user?._id) return;
      setLoadingVideos(true);
      setVideosError("");
      try {
        const res = await getInstructorVideos(user._id);
        const list = res?.data || res || [];
        setVideos(Array.isArray(list) ? list : []);
      } catch (e) {
        setVideosError(typeof e === 'string' ? e : e?.message || 'Failed to load videos');
      } finally {
        setLoadingVideos(false);
      }
    };
    fetchVideos();
  }, [user?._id, user?.role]);

  // Derive optional metrics from watch-stats endpoint
  const derived = useMemo(() => {
    const watchHours = num(watchStats?.totalWatchTimeHours, 'totalWatchTimeHours');
    const avgViewDurationSec = num(watchStats?.avgViewDurationSeconds, 'avgViewDurationSeconds');
    return {
      watchHours,
      avgViewDuration: avgViewDurationSec ? formatSecondsToHMS(avgViewDurationSec) : '00:00:00',
    };
  }, [watchStats]);

  const lastThree = useMemo(() => (videos || []).slice(0, 3), [videos]);
  const viewData = useMemo(() => {
    const rows = lastThree.map(v => ({ id: v._id, label: v.title, value: Number(v.views) || 0 }));
    return rows.sort((a, b) => b.value - a.value);
  }, [lastThree]);
  const likeData = useMemo(() => {
    const rows = lastThree.map(v => ({ id: v._id, label: v.title, value: Number(likesMap[v._id]) || 0 }));
    return rows.sort((a, b) => b.value - a.value);
  }, [lastThree, likesMap]);

  // Fetch likes for last three videos
  useEffect(() => {
    const fetchLikes = async () => {
      if (!lastThree.length || user?.role !== 'instructor') return;
      setLoadingLikes(true);
      setLikesError("");
      try {
        const ids = lastThree.map(v => v._id);
        const res = await getLikesByVideoIds(ids);
        const data = res?.data || res || {};
        setLikesMap(typeof data === 'object' && data !== null ? data : {});
      } catch (e) {
        setLikesError(typeof e === 'string' ? e : e?.message || 'Failed to load likes');
      } finally {
        setLoadingLikes(false);
      }
    };
    fetchLikes();
  }, [lastThree, user?.role]);

  return (
    <div className="px-6 md:px-10 flex justify-center py-5 bg-[#fcf8f8]">
      <div className="flex flex-col max-w-[960px] flex-1">
        <div className="flex flex-wrap justify-between gap-3 p-4">
          <div className="flex min-w-72 flex-col gap-3">
            <p className="text-[#1b0e0e] tracking-light text-[32px] font-bold leading-tight">Dashboard</p>
            <p className="text-[#994d51] text-sm font-normal leading-normal">Last 28 days</p>
          </div>
        </div>

        {/* Metric cards */}
        <div className="flex flex-wrap gap-4 p-4">
          {loadingStats || loadingWatch ? (
            <div className="text-[#994d51] text-sm">Loading stats...</div>
          ) : statsError ? (
            <div className="text-red-600 text-sm">{statsError}</div>
          ) : watchError ? (
            <div className="text-red-600 text-sm">{watchError}</div>
          ) : (
            <>
              <div className="flex min-w-[158px] flex-1 flex-col gap-2 rounded-lg p-6 bg-[#f3e7e8]">
                <p className="text-[#1b0e0e] text-base font-medium leading-normal">Total views</p>
                <p className="text-[#1b0e0e] tracking-light text-2xl font-bold leading-tight">{num(stats?.totalViews, 'totalViews').toLocaleString?.() || num(stats?.totalViews, 'totalViews')}</p>
              </div>
              <div className="flex min-w-[158px] flex-1 flex-col gap-2 rounded-lg p-6 bg-[#f3e7e8]">
                <p className="text-[#1b0e0e] text-base font-medium leading-normal">Watch time (hours)</p>
                <p className="text-[#1b0e0e] tracking-light text-2xl font-bold leading-tight">{derived.watchHours || 0}</p>
              </div>
              <div className="flex min-w-[158px] flex-1 flex-col gap-2 rounded-lg p-6 bg-[#f3e7e8]">
                <p className="text-[#1b0e0e] text-base font-medium leading-normal">Subscribers</p>
                <p className="text-[#1b0e0e] tracking-light text-2xl font-bold leading-tight">{num(stats?.totalSubscribers, 'totalSubscribers')}</p>
              </div>
              <div className="flex min-w-[158px] flex-1 flex-col gap-2 rounded-lg p-6 bg-[#f3e7e8]">
                <p className="text-[#1b0e0e] text-base font-medium leading-normal">Avg. view duration</p>
                <p className="text-[#1b0e0e] tracking-light text-2xl font-bold leading-tight">{derived.avgViewDuration}</p>
              </div>
            </>
          )}
        </div>

        {/* Charts */}
        <div className="flex flex-wrap gap-4 px-4 py-6">
          <div className="flex min-w-72 flex-1 flex-col gap-2">
            <p className="text-[#1b0e0e] text-base font-medium leading-normal">Views per last 3 uploaded videos</p>
            {loadingVideos ? (
              <p className="text-[#994d51] text-sm">Loading…</p>
            ) : videosError ? (
              <p className="text-red-600 text-sm">{videosError}</p>
            ) : viewData.length ? (
              <SimpleBars data={viewData} barColorClass="bg-[#e7c9cb]" valueFormatter={(n)=> (n||0).toLocaleString?.() || (n||0)} />
            ) : (
              <p className="text-[#994d51] text-sm">No videos yet</p>
            )}
          </div>
          <div className="flex min-w-72 flex-1 flex-col gap-2">
            <p className="text-[#1b0e0e] text-base font-medium leading-normal">Likes per Video</p>
            {loadingLikes ? (
              <p className="text-[#994d51] text-sm">Loading…</p>
            ) : likesError ? (
              <p className="text-red-600 text-sm">{likesError}</p>
            ) : likeData.length ? (
              <SimpleBars data={likeData} barColorClass="bg-[#e7c9cb]" valueFormatter={(n)=> (n||0).toLocaleString?.() || (n||0)} />
            ) : (
              <p className="text-[#994d51] text-sm">No videos yet</p>
            )}
          </div>
        </div>

        {/* Recent videos table */}
        <h2 className="text-[#1b0e0e] text-[22px] font-bold leading-tight tracking-[-0.015em] px-4 pb-3 pt-5">Recent videos</h2>
        <div className="px-4 py-3">
          <div className="flex overflow-hidden rounded-lg border border-[#e7d0d1] bg-[#fcf8f8]">
            <table className="flex-1">
              <thead>
                <tr className="bg-[#fcf8f8]">
                  <th className="px-4 py-3 text-left text-[#1b0e0e] text-sm font-medium leading-normal">Video</th>
                  <th className="px-4 py-3 text-left text-[#1b0e0e] text-sm font-medium leading-normal">Views</th>
                  <th className="px-4 py-3 text-left text-[#1b0e0e] text-sm font-medium leading-normal">Duration</th>
                </tr>
              </thead>
              <tbody>
                {loadingVideos ? (
                  <tr className="border-t border-t-[#e7d0d1]"><td className="h-[72px] px-4 py-2 text-[#994d51] text-sm" colSpan={3}>Loading…</td></tr>
                ) : videosError ? (
                  <tr className="border-t border-t-[#e7d0d1]"><td className="h-[72px] px-4 py-2 text-red-600 text-sm" colSpan={3}>{videosError}</td></tr>
                ) : videos.length ? (
                  videos.slice(0, 5).map(v => (
                    <tr key={v._id} className="border-t border-t-[#e7d0d1]">
                      <td className="h-[72px] px-4 py-2 text-[#1b0e0e] text-sm font-normal leading-normal truncate" title={v.title}>{v.title}</td>
                      <td className="h-[72px] px-4 py-2 text-[#994d51] text-sm font-normal leading-normal">{(Number(v.views)||0).toLocaleString?.() || (Number(v.views)||0)}</td>
                      <td className="h-[72px] px-4 py-2 text-[#994d51] text-sm font-normal leading-normal">{ensureHMS(v.duration)}</td>
                    </tr>
                  ))
                ) : (
                  <tr className="border-t border-t-[#e7d0d1]"><td className="h-[72px] px-4 py-2 text-[#994d51] text-sm" colSpan={3}>No recent videos to display</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;

// Simple, accessible bars component with numeric labels and sorted data
function SimpleBars({ data, barColorClass = "bg-gray-400", valueFormatter = (n)=>n }) {
  const maxVal = Math.max(1, ...data.map(d => d.value || 0));
  return (
    <div className="min-h-[200px] px-3">
      <div className="grid grid-flow-col auto-cols-fr gap-6 items-end justify-items-center" role="img" aria-label="bar chart">
        {data.map((d) => {
          const heightPct = Math.max(6, Math.round(((d.value || 0) / maxVal) * 100));
          return (
            <div key={d.id} className="w-full flex flex-col items-center justify-end gap-2">
              <span className="text-[#1b0e0e] text-xs font-medium" title={String(d.value)}>{valueFormatter(d.value)}</span>
              <div className="w-full h-40 flex items-end">
                <div className={`${barColorClass} w-full rounded-sm`} style={{ height: `${heightPct}%` }} aria-valuemin={0} aria-valuemax={maxVal} aria-valuenow={d.value} />
              </div>
              <p className="text-[#994d51] text-[12px] font-semibold leading-normal tracking-[0.015em] truncate max-w-[12ch]" title={d.label}>{d.label}</p>
            </div>
          );
        })}
      </div>
      <div className="flex justify-between text-[11px] text-[#994d51] mt-2">
        <span>0</span>
        <span>{valueFormatter(Math.round(maxVal/2))}</span>
        <span>{valueFormatter(maxVal)}</span>
      </div>
    </div>
  );
}
