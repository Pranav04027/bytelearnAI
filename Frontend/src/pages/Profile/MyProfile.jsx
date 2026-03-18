import useAuth from "../../hooks/useAuth.js";
import { useEffect, useState } from "react";
import { getMyPlaylists } from "../../api/playlists.js";
import { Link } from "react-router-dom";

const MyProfile = () => {
  const { user } = useAuth();
  const [playlists, setPlaylists] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await getMyPlaylists();
        const data = Array.isArray(res?.data) ? res.data : res?.data?.playlists || res?.data || [];
        setPlaylists(data);
      } catch (_) {
        setPlaylists([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  return (
    <div className="max-w-7xl mx-auto p-3 md:p-4">
      <div className="bg-white/70 shadow-sm rounded-xl p-4 md:p-6">
        <h1 className="text-[#1b0e0e] tracking-light text-[28px] md:text-[32px] font-bold leading-tight mb-4 md:mb-6">My Profile</h1>

        {/* Identity header */}
        <div className="flex items-center gap-4 md:gap-6">
          {user?.avatar ? (
            <img
              src={user.avatar}
              alt={user.fullname}
              className="h-24 w-24 md:h-28 md:w-28 rounded-full ring-1 ring-[#e7d0d1] object-cover"
            />
          ) : (
            <div className="h-24 w-24 md:h-28 md:w-28 rounded-full bg-[#f3e7e8] flex items-center justify-center">
              <span className="text-[#1b0e0e] text-xl md:text-2xl">{user?.fullname?.charAt(0) || "U"}</span>
            </div>
          )}
          <div>
            <p className="text-xl font-semibold text-[#1b0e0e]">{user?.fullname}</p>
            <div className="flex items-center gap-2">
              <p className="text-[#1b0e0e]/70">@{user?.username}</p>
              <span className="inline-flex items-center gap-1 rounded-full bg-[#f3e7e8] text-[#1b0e0e] px-2 py-0.5 text-[11px] font-medium capitalize">
                {user?.role || "learner"}
              </span>
            </div>
          </div>
        </div>

        {/* Contact info */}
        <div className="mt-4 md:mt-6">
          <label className="block text-xs font-medium text-[#994d51]">Email</label>
          <p className="mt-1 text-sm text-[#1b0e0e]">{user?.email}</p>
        </div>

        {/* Playlists */}
        <div className="mt-4 md:mt-6">
          <label className="block text-xs font-medium text-[#994d51] mb-2">My Playlists</label>
          {loading ? (
            <div className="text-sm text-[#1b0e0e]/70">Loading...</div>
          ) : playlists.length === 0 ? (
            <div className="text-sm text-[#1b0e0e]/70">No playlists yet. Create one from a video or the playlists page.</div>
          ) : (
            <div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {playlists.slice(0, 2).map((p) => (
                  <Link
                    key={p._id}
                    to={`/playlists/${p._id}`}
                    className="block p-3 rounded-lg bg-white/70 shadow-sm hover:bg-white transition"
                    aria-label={`Open playlist ${p.name}`}
                  >
                    <div className="font-medium text-[#1b0e0e] text-sm">{p.name}</div>
                    <div className="text-xs text-[#1b0e0e]/70">{p.description}</div>
                  </Link>
                ))}
              </div>
              <div className="pt-3">
                <Link to="/playlists" className="inline-block bg-[#f3e7e8] text-[#1b0e0e] px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90">
                  View All
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="mt-4 md:mt-6 grid grid-cols-2 md:grid-cols-4 gap-3">
          <Link to="/profile/edit" className="text-center bg-[#f3e7e8] text-[#1b0e0e] px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90">
            Edit Profile
          </Link>
          <Link to="/playlists" className="text-center bg-[#f3e7e8] text-[#1b0e0e] px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90">
            Manage Playlists
          </Link>
          <Link to="/history" className="text-center bg-[#f3e7e8] text-[#1b0e0e] px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90">
            View History
          </Link>
          <Link to="/subscriptions" className="text-center bg-[#f3e7e8] text-[#1b0e0e] px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90">
            Subscriptions
          </Link>
        </div>
      </div>
    </div>
  );
};

export default MyProfile;
