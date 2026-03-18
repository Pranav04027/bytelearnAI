import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { getUserChannel } from "../../api/auth.js";
import { getUserPlaylists } from "../../api/playlists.js";
import { getSubscribedChannels, toggleSubscription } from "../../api/subscriptions.js";
import { getInstructorVideos } from "../../api/instructor.js";
import { getUserPublicVideos } from "../../api/videos.js";
import { getUserPosts } from "../../api/posts.js";
import { getQuizByVideoId, getQuizExistsByVideoId } from "../../api/quizzes.js";
import useAuth from "../../hooks/useAuth.js";

const UserChannel = () => {
  const { username } = useParams();
  const [channel, setChannel] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [playlists, setPlaylists] = useState([]);
  const [uploads, setUploads] = useState([]);
  const [subsCount, setSubsCount] = useState(0);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [posts, setPosts] = useState([]);
  const [role, setRole] = useState("");
  const [avgScore, setAvgScore] = useState(null); // learner-only (requires backend support for public)
  const [quizExists, setQuizExists] = useState({}); // videoId -> true/false
  const { user, isAuthed } = useAuth();

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const res = await getUserChannel(username);
        // Handle array or object response
        let rawTop = res?.data ?? res;
        if (Array.isArray(rawTop)) rawTop = rawTop[0] || {};
        const core = rawTop?.data ?? rawTop?.user ?? rawTop?.channel ?? rawTop;
        if (!core || typeof core !== 'object') throw new Error("No user data");
        const data = {
          ...core,
          avatar: core.avatar?.replace('http://', 'https://'),
          coverImage: core.coverImage?.replace('http://', 'https://'),
          username: core.username || core.handle || core.userName || core.name || core.fullname || core.fullName || core._id,
          fullname: core.fullname || core.fullName || core.name || core.username,
          _id: core._id || core.id || core.userId,
        };
        setChannel(data);
        setRole(
          (data.role || data.accountType || data.userType || "").toString().toLowerCase()
        );

        // derive subscriber count from various possible shapes
        const sc = (() => {
          const val =
            data?.numberOfSubscribers ??
            data?.subscribersCount ??
            data?.subscriberCount ??
            (Array.isArray(data?.subscribers) ? data.subscribers.length : data?.subscribers) ??
            data?.stats?.subscribers ??
            0;
          return typeof val === "number" ? val : Number(val) || 0;
        })();
        setSubsCount(sc);

        const userId = data?._id || data?.userId || data?.id;
        if (userId) {
          const pres = await getUserPlaylists(userId);
          const plist = Array.isArray(pres?.data) ? pres.data : pres?.data?.playlists || pres?.data || [];
          setPlaylists(plist);
          // Try to load uploads (works for instructors; may be empty for learners)
          let mapped = [];
          // Only call getInstructorVideos if the user is an instructor
          if ((data.role || '').toLowerCase() === 'instructor') {
            try {
              const vres = await getInstructorVideos(userId);
              const arr = Array.isArray(vres?.data) ? vres.data : (vres?.videos || vres?.data?.videos || []);
              mapped = (Array.isArray(arr) ? arr : []).map((v) => ({
                ...v,
                thumbnail: v.thumbnail?.replace('http://', 'https://'),
                poster: v.poster?.replace('http://', 'https://'),
                videofile: v.videofile?.replace('http://', 'https://'),
                title: v.title || v.name || v._id,
                id: v._id || v.id,
              })).filter((x) => x.id);
            } catch (_) {
              mapped = [];
            }
          }
          // Fallback to public videos for this user via videos endpoint, or always for non-instructors
          if (!mapped.length) {
            try {
              const pageSize = 50;
              let page = 1;
              let all = [];
              let total = Infinity;
              while (all.length < total) {
                const res = await getUserPublicVideos({ userId, page, limit: pageSize });
                const data = res?.data || {};
                const results = Array.isArray(data.results) ? data.results : [];
                total = typeof data.total === 'number' ? data.total : results.length;
                all = all.concat(results);
                if (results.length < pageSize) break;
                page += 1;
              }
              mapped = all.map((v) => ({
                ...v,
                thumbnail: v.thumbnail?.replace('http://', 'https://'),
                poster: v.poster?.replace('http://', 'https://'),
                videofile: v.videofile?.replace('http://', 'https://'),
                title: v.title || v.name || v._id,
                id: v._id || v.id,
              })).filter((x) => x.id);
            } catch (_) {
              // ignore
            }
          }
          setUploads(mapped);

          // Load posts for this user
          try {
            const postRes = await getUserPosts(userId);
            const plist = Array.isArray(postRes?.data) ? postRes.data : (postRes?.posts || postRes?.data?.posts || []);
            setPosts(Array.isArray(plist) ? plist : []);
          } catch (_) {
            setPosts([]);
          }
        } else {
          setPlaylists([]);
          setUploads([]);
          setPosts([]);
        }

        // if authed, detect if current user is subscribed to this channel
        if (isAuthed && user?._id && (data?._id || data?.userId || data?.id)) {
          try {
            const sres = await getSubscribedChannels(user._id);
            const list = Array.isArray(sres?.data) ? sres.data : sres?.data?.channels || sres?.data || [];
            const channelId = data?._id || data?.userId || data?.id;
            const found = list.some((it) => {
              const cid = it?._id || it?.channelId || it?.channel?._id || it?.channel;
              return cid && cid === channelId;
            });
            setIsSubscribed(found);
          } catch (_) {
            // ignore detection errors
          }
        } else {
          setIsSubscribed(false);
        }
      } catch (e) {
        setError(typeof e === "string" ? e : e?.message || "Failed to load user");
      } finally {
        setLoading(false);
      }
    };
    if (username) load();
  }, [username, isAuthed, user?._id]);

  useEffect(() => {
    // After uploads are set
    if (uploads.length > 0) {
      uploads.forEach(async (v) => {
        if (!v.id) return;
        try {
          const exists = await getQuizExistsByVideoId(v.id);
          setQuizExists((prev) => ({ ...prev, [v.id]: !!exists }));
        } catch (_) {
          setQuizExists((prev) => ({ ...prev, [v.id]: false }));
        }
      });
    }
  }, [uploads]);

  const onToggleSubscription = async () => {
    if (!channel) return;
    const channelId = channel?._id || channel?.userId || channel?.id;
    if (!channelId) return;
    try {
      setSubscribing(true);
      const prev = isSubscribed;
      setIsSubscribed(!prev);
      setSubsCount((c) => c + (prev ? -1 : 1));
      await toggleSubscription(channelId);
    } catch (err) {
      // revert on failure
      setIsSubscribed((v) => !v);
      setSubsCount((c) => c + (isSubscribed ? 1 : -1));
    } finally {
      setSubscribing(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto bg-white shadow rounded-lg p-6 text-center text-gray-600">Loading...</div>
    );
  }

  if (error || !channel) {
    return (
      <div className="max-w-5xl mx-auto bg-white shadow rounded-lg p-6 text-center">
        <p className="text-red-600">{error || "User not found"}</p>
        <Link to="/" className="text-indigo-600 hover:text-indigo-700 inline-block mt-4">Back to Home</Link>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="bg-white shadow rounded-lg">
        {channel?.coverImage ? (
          <img src={channel.coverImage} alt="cover" className="w-full h-40 object-cover rounded-t-lg" />
        ) : (
          <div className="w-full h-40 bg-gray-200 rounded-t-lg" />
        )}
        <div className="p-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
          {channel?.avatar ? (
            <img src={channel.avatar} alt={channel.fullname || channel.username} className="h-16 w-16 rounded-full" />
          ) : (
            <div className="h-16 w-16 rounded-full bg-gray-300 flex items-center justify-center text-xl text-gray-700">
              {(channel?.fullname || channel?.username || "U").charAt(0)}
            </div>
          )}
          <div>
            <div className="text-xl font-semibold text-gray-900">{channel?.fullname || channel?.username}</div>
            <div className="text-sm text-gray-600">@{channel?.username}</div>
            <div className="mt-1 text-sm text-gray-700">
              <span className="font-medium">{subsCount}</span> subscribers
            </div>
            {role && (
              <div className="text-xs text-gray-500 mt-0.5 uppercase tracking-wide">{role}</div>
            )}
          </div>
          </div>
          {/* Subscribe button for public profile, not own profile */}
          {isAuthed && user?._id !== (channel?._id || channel?.userId || channel?.id) && (
            <button
              onClick={onToggleSubscription}
              disabled={subscribing}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                isSubscribed ? "bg-gray-200 text-gray-800 hover:bg-gray-300" : "bg-red-600 text-white hover:bg-red-700"
              } disabled:opacity-50`}
            >
              {subscribing ? "..." : isSubscribed ? "Subscribed" : "Subscribe"}
            </button>
          )}
        </div>
      </div>

      {/* Role-specific sections */}
      {/* Always show Uploads section, even for learners */}
      <div className="bg-white shadow rounded-lg p-4">
        <h3 className="text-base font-medium text-gray-900 mb-2">Uploads</h3>
        {uploads.length === 0 ? (
          <div className="text-sm text-gray-600">No uploads yet.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {uploads.map((v) => {
              const link = v.id ? `/videos/${v.id}` : null;
              const thumb = v.thumbnail || v.poster || v.videofile;
              return (
                <div key={v.id} className="border rounded-lg overflow-hidden bg-[#fcf8f8]">
                  {thumb ? (
                    <Link to={link}>
                      <img src={thumb} alt={v.title} className="w-full h-32 object-cover" />
                    </Link>
                  ) : (
                    <div className="w-full h-32 bg-gray-200" />
                  )}
                  <div className="p-3">
                    <Link to={link} className="block text-sm font-medium text-[#1b0e0e] line-clamp-2 hover:underline">
                      {v.title}
                    </Link>
                    {v.description && (
                      <div className="mt-1 text-xs text-[#1b0e0e]/70 line-clamp-2">{v.description}</div>
                    )}
                    <div className="mt-2 text-xs">
                      Quiz: {quizExists[v.id] === undefined ? "Checking..." : quizExists[v.id] ? "Yes" : "No"}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {v.category && (
                        <span className="inline-block px-3 py-1 rounded-full text-xs bg-[#f3eaea] text-[#7a4d4d]">{v.category}</span>
                      )}
                      {v.difficulty && (
                        <span className="inline-block px-3 py-1 rounded-full text-xs bg-[#f3eaea] text-[#7a4d4d]">{v.difficulty}</span>
                      )}
                      {quizExists[v.id] === undefined ? null : quizExists[v.id] ? (
                        <span className="inline-block px-3 py-1 rounded-full text-xs bg-green-100 text-green-700 font-semibold">Quiz available</span>
                      ) : (
                        <span className="inline-block px-3 py-1 rounded-full text-xs bg-[#f3eaea] text-[#7a4d4d]">No quiz</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Learner section */}
      {role === "learner" && (
        <div className="bg-white shadow rounded-lg p-4">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Learner</h2>
          <div className="text-sm text-gray-700">Average Score: {avgScore != null ? `${avgScore}%` : "Not available"}</div>
        </div>
      )}

      {/* Posts */}
      <div className="bg-white shadow rounded-lg p-4">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Posts</h2>
        {posts.length === 0 ? (
          <div className="text-sm text-gray-600">No posts yet.</div>
        ) : (
          <div className="space-y-3">
            {posts.map((p) => (
              <div key={p._id || p.id} className="p-3 border rounded bg-white">
                <div className="text-sm font-medium text-gray-900">{p.title || "Post"}</div>
                {p.content && <div className="text-sm text-gray-700 mt-1 whitespace-pre-line">{p.content}</div>}
                <div className="text-xs text-gray-500 mt-2">
                  {new Date(p.createdAt || p.updatedAt || Date.now()).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Playlists (optional) */}
      <div className="bg-white shadow rounded-lg p-4">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Playlists</h2>
        {playlists.length === 0 ? (
          <div className="text-sm text-gray-600">No playlists to show.</div>
        ) : (
          <div className="space-y-2">
            {playlists.map((p) => (
              <div key={p._id} className="p-3 border rounded">
                <div className="font-medium text-gray-900">{p.name}</div>
                <div className="text-sm text-gray-600">{p.description}</div>
                {Array.isArray(p.videos) && p.videos.length > 0 && (
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    {p.videos.slice(0, 6).map((v) => (
                      <div key={v._id} className="text-xs text-gray-700 flex items-center gap-2">
                        {v.thumbnail ? (
                          <img src={v.thumbnail} alt={v.title} className="h-10 w-16 object-cover rounded" />
                        ) : (
                          <div className="h-10 w-16 bg-gray-200 rounded" />
                        )}
                        <span className="line-clamp-2">{v.title}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default UserChannel;
