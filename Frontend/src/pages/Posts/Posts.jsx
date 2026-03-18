
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import useAuth from "../../hooks/useAuth.js";
import { createTweet, getUserPosts, deletePost } from "../../api/posts.js";
import { toggleLikePost } from "../../api/likes.js";

const Posts = () => {
  const { user } = useAuth();
  const [posts, setPosts] = useState([]);
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  // util: validate Mongo ObjectId string (24 hex chars)
  const isValidObjectIdStr = (s) => typeof s === "string" && /^[a-fA-F0-9]{24}$/.test(s);

  // helpers for cache
  const cacheKey = "posts:mine";
  const readCache = () => {
    try {
      if (typeof localStorage === "undefined") return [];
      const raw = localStorage.getItem(cacheKey);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  };
  const writeCache = (list) => {
    try {
      if (typeof localStorage === "undefined") return;
      localStorage.setItem(cacheKey, JSON.stringify(list || []));
    } catch (_) {}
  };

  useEffect(() => {
    const load = async () => {
      // rehydrate from cache immediately for better UX
      const cached = readCache();
      if (cached.length) setPosts(cached);

      if (!user?._id) {
        // if not authed, keep cached posts only
        return;
      }
      setLoading(true);
      setError("");
      try {
        const res = await getUserPosts(user._id);
        // support ApiResponse wrappers and raw arrays
        const raw = Array.isArray(res)
          ? res
          : (Array.isArray(res?.data) ? res.data : (Array.isArray(res?.data?.data) ? res.data.data : []));
        // Map backend posts to UI shape
        const mapped = raw.map((p) => {
          const id = p?._id || p?.id;
          // derive like count from server structure, then overlay local cache
          const serverCount = typeof p?.likes === "number"
            ? p.likes
            : Array.isArray(p?.likes)
              ? p.likes.length
              : (typeof p?.likeCount === "number" ? p.likeCount : 0);
          let cachedLiked = null;
          let cachedCount = null;
          try {
            if (typeof localStorage !== "undefined" && id) {
              const l = localStorage.getItem(`post:liked:${id}`);
              const cnt = localStorage.getItem(`post:likes:${id}`);
              if (l === "1" || l === "0") cachedLiked = l === "1";
              if (cnt !== null && cnt !== undefined) cachedCount = Number(cnt);
            }
          } catch (_) {}
          return {
            id,
            authorName: p?.owner?.fullname || p?.owner?.username || p?.owner?.email || p?.ownerName || "User",
            authorAvatar: p?.owner?.avatar || "/default-avatar.png",
            content: p?.content || "",
            createdAt: p?.createdAt ? new Date(p.createdAt).toLocaleString() : "",
            likeCount: (typeof cachedCount === "number" && Number.isFinite(cachedCount)) ? cachedCount : serverCount,
            isLiked: (typeof cachedLiked === "boolean") ? cachedLiked : false,
          };
        }).filter((x) => x.id);
        // merge with cached by id (server wins)
        const map = new Map(cached.map((x) => [x.id, x]));
        for (const item of mapped) map.set(item.id, item);
        const merged = Array.from(map.values());
        setPosts(merged);
        writeCache(merged);
      } catch (e) {
        setError(typeof e === "string" ? e : e?.message || "Failed to load posts");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user?._id]);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (!user) {
      setError("Please login to create a post.");
      return;
    }
    if (!content.trim()) {
      setError("Write something to post.");
      return;
    }
    try {
      setSubmitting(true);
      const payload = { content: content.trim() };
      const res = await createTweet(payload);
      // Handle common API envelope shapes
      const createdData = res?.data?.data || res?.data || res;
      // Use a temporary client id for immediate UX, then replace when real id known
      const tempId = `temp-${Date.now()}`;
      const optimistic = {
        id: tempId,
        authorName: user.fullname || user.username || user.email || "You",
        authorAvatar: user.avatar || "/default-avatar.png",
        content: content.trim(),
        createdAt: new Date().toLocaleString(),
        likeCount: 0,
        isLiked: false,
      };
      setPosts((prev) => {
        const next = [optimistic, ...prev];
        writeCache(next);
        return next;
      });
      // If backend returned a proper id, replace temp id entry
      const createdId = createdData?._id || createdData?.id;
      if (createdId) {
        setPosts((prev) => {
          const next = prev.map((p) => (p.id === tempId ? { ...p, id: createdId } : p));
          writeCache(next);
          return next;
        });
      } else {
        // Fallback: refresh from server to obtain canonical ids
        try {
          if (user?._id) {
            const r = await getUserPosts(user._id);
            const raw = Array.isArray(r)
              ? r
              : (Array.isArray(r?.data) ? r.data : (Array.isArray(r?.data?.data) ? r.data.data : []));
            const mapped = raw.map((p) => ({
              id: p?._id || p?.id,
              authorName: p?.owner?.fullname || p?.owner?.username || p?.owner?.email || p?.ownerName || "User",
              authorAvatar: p?.owner?.avatar || "/default-avatar.png",
              content: p?.content || "",
              createdAt: p?.createdAt ? new Date(p.createdAt).toLocaleString() : "",
              likeCount: typeof p?.likes === "number" ? p.likes : (Array.isArray(p?.likes) ? p.likes.length : (typeof p?.likeCount === "number" ? p.likeCount : 0)),
              isLiked: false,
            })).filter((x) => x.id);
            setPosts(mapped);
            writeCache(mapped);
          }
        } catch (_) {}
      }
      setContent("");
      setSuccess("Posted");
      setTimeout(() => setSuccess(""), 1200);
    } catch (err) {
      const msg = typeof err === "string" ? err : err?.message || "Failed to create post";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const onToggleLike = async (postId) => {
    // Do not attempt like if id is not a valid ObjectId yet (e.g., optimistic temp id)
    if (!isValidObjectIdStr(postId)) {
      console.warn("Skipping like: invalid post id", postId);
      return;
    }
    // optimistic update
    setPosts((prev) => {
      const next = prev.map((p) => {
        if (p.id !== postId) return p;
        const nextLiked = !p.isLiked;
        const nextCount = nextLiked ? (p.likeCount ?? 0) + 1 : Math.max(0, (p.likeCount ?? 0) - 1);
        try {
          if (typeof localStorage !== "undefined") {
            localStorage.setItem(`post:liked:${postId}`, nextLiked ? "1" : "0");
            localStorage.setItem(`post:likes:${postId}`, String(nextCount));
          }
        } catch (_) {}
        return { ...p, isLiked: nextLiked, likeCount: nextCount };
      });
      writeCache(next);
      return next;
    });
    try {
      await toggleLikePost(postId);
    } catch (e) {
      // revert on failure
      setPosts((prev) => {
        const next = prev.map((p) => {
          if (p.id !== postId) return p;
          const nextLiked = !p.isLiked; // revert
          const nextCount = nextLiked ? (p.likeCount ?? 0) + 1 : Math.max(0, (p.likeCount ?? 0) - 1);
          try {
            if (typeof localStorage !== "undefined") {
              localStorage.setItem(`post:liked:${postId}`, nextLiked ? "1" : "0");
              localStorage.setItem(`post:likes:${postId}`, String(nextCount));
            }
          } catch (_) {}
          return { ...p, isLiked: nextLiked, likeCount: nextCount };
        });
        writeCache(next);
        return next;
      });
      console.error("Failed to like post:", e);
    }
  };

  const onDeletePost = async (postId) => {
    if (!window.confirm("Are you sure you want to delete this post?")) return;
    try {
      await deletePost(postId);
      // After delete, fetch latest posts from server and update UI/cache
      if (user?._id) {
        const res = await getUserPosts(user._id);
        const raw = Array.isArray(res)
          ? res
          : (Array.isArray(res?.data) ? res.data : (Array.isArray(res?.data?.data) ? res.data.data : []));
        const mapped = raw.map((p) => ({
          id: p?._id || p?.id,
          authorName: p?.owner?.fullname || p?.owner?.username || p?.owner?.email || p?.ownerName || "User",
          authorAvatar: p?.owner?.avatar || "/default-avatar.png",
          content: p?.content || "",
          createdAt: p?.createdAt ? new Date(p.createdAt).toLocaleString() : "",
          likeCount: typeof p?.likes === "number" ? p.likes : (Array.isArray(p?.likes) ? p.likes.length : (typeof p?.likeCount === "number" ? p.likeCount : 0)),
          isLiked: false,
        })).filter((x) => x.id);
        setPosts(mapped);
        writeCache(mapped);
      } else {
        setPosts((prev) => prev.filter((p) => p.id !== postId));
      }
    } catch (e) {
      setError(typeof e === "string" ? e : e?.message || "Failed to delete post");
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Posts</h1>
        <div className="text-sm text-gray-600">
          {user ? (
            <span>Signed in as <span className="font-medium text-gray-900">{user.username || user.email || "you"}</span></span>
          ) : (
            <span>
              Please <Link to="/login" className="text-indigo-600 hover:text-indigo-700">login</Link> to create and interact with posts.
            </span>
          )}
        </div>
      </div>

      {/* Compose box */}
      <form onSubmit={onSubmit} className="bg-white rounded-lg shadow p-4">
        <div className="flex items-start gap-3">
          <img
            src={user?.avatar || "/default-avatar.png"}
            alt="me"
            className="w-10 h-10 rounded-full object-cover"
            onError={(e) => { e.currentTarget.src = "/default-avatar.png"; }}
          />
          <div className="flex-1">
            {error && (
              <div className="mb-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>
            )}
            {success && (
              <div className="mb-2 rounded border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700">{success}</div>
            )}
            <textarea
              rows={3}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={user ? "Share something with your learners..." : "Login to create a post"}
              disabled={!user || submitting}
              maxLength={500}
              className="w-full border rounded-md p-3 text-sm text-gray-700 bg-white disabled:bg-gray-50 disabled:opacity-60"
            />
            <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
              <span>{content.length}/500</span>
              <button
                type="submit"
                disabled={!user || submitting || !content.trim()}
                className="px-4 py-2 rounded-md bg-indigo-600 text-white shadow disabled:opacity-50"
              >
                {submitting ? "Posting..." : "Post"}
              </button>
            </div>
          </div>
        </div>
      </form>

      {/* Feed */}
      <div className="space-y-4">
        {loading ? (
          <div className="bg-white rounded-lg shadow p-8 text-center text-gray-600">Loading posts...</div>
        ) : posts.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <h2 className="text-lg font-semibold text-gray-900">No posts yet</h2>
            <p className="mt-2 text-sm text-gray-600">
              When posting is enabled, you’ll see community posts here.
            </p>
          </div>
        ) : (
          posts.map((p) => (
            <div key={p.id} className="bg-white rounded-lg shadow p-4">
              <div className="flex items-start gap-3">
                <img src={p.authorAvatar} alt="avatar" className="w-10 h-10 rounded-full object-cover" />
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900">{p.authorName}</p>
                      <p className="text-xs text-gray-500">{p.createdAt}</p>
                    </div>
                    <div className="flex items-center gap-3 text-sm text-gray-700">
                      <button
                        onClick={() => onToggleLike(p.id)}
                        disabled={!isValidObjectIdStr(p.id)}
                        className={`px-3 py-1 rounded border ${p.isLiked ? "bg-red-50 text-red-600 border-red-200" : "bg-gray-50 border-gray-200"} ${!isValidObjectIdStr(p.id) ? "opacity-50 cursor-not-allowed" : ""}`}
                      >
                        {p.isLiked ? "Unlike" : "Like"}
                      </button>
                      <span>
                        Likes: <span className="text-gray-900">{p.likeCount ?? 0}</span>
                      </span>
                      <button
                        onClick={() => onDeletePost(p.id)}
                        className="px-3 py-1 rounded border bg-red-50 text-red-600 border-red-200 hover:bg-red-100 ml-2"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                  <p className="mt-2 text-gray-800 whitespace-pre-wrap">{p.content}</p>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default Posts;
