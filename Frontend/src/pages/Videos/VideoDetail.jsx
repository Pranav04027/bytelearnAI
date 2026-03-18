import { useEffect, useState, useRef } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { getVideoById } from "../../api/videos.js";
import { toggleLikeVideo, getLikedVideos } from "../../api/likes.js";
import { getMyPlaylists, createPlaylist, addVideoToPlaylist } from "../../api/playlists.js";
import { addBookmark, removeBookmark, getMyBookmarks } from "../../api/bookmarks.js";
import { toggleSubscription, getSubscribedChannels } from "../../api/subscriptions.js";
import { getUserById } from "../../api/auth.js";
import { updateVideoProgress } from "../../api/progress.js";
import { ensureHMS } from "../../utils/time.js";
import VideoComments from "../Comments/VideoComments.jsx";
import useAuth from "../../hooks/useAuth.js";
import axios from "../../api/axios.js";

const MetaItem = ({ label, value }) => (
  <div>
    <span className="text-gray-500 text-sm mr-2">{label}:</span>
    <span className="text-gray-900 text-sm capitalize">{value || "-"}</span>
  </div>
);

const VideoDetail = () => {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const isAuthed = Boolean(user);
  const [video, setVideo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [liking, setLiking] = useState(false);
  const [isLiked, setIsLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [commentCount, setCommentCount] = useState(0);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [views, setViews] = useState(null);
  const [showPlaylistModal, setShowPlaylistModal] = useState(false);
  const [loadingPlaylists, setLoadingPlaylists] = useState(false);
  const [myPlaylists, setMyPlaylists] = useState([]);
  const [creatingPlaylist, setCreatingPlaylist] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [newPlaylistDescription, setNewPlaylistDescription] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [ownerInfo, setOwnerInfo] = useState(null);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const videoRef = useRef(null);
  const progressTimerRef = useRef(null);
  const lastPercentRef = useRef(0);
  const hasSentInitialRef = useRef(false);
  const viewSentRef = useRef(false);
  const [isPlaying, setIsPlaying] = useState(false);

  // util: validate Mongo ObjectId string (24 hex chars)
  const isValidObjectIdStr = (s) => typeof s === "string" && /^[a-fA-F0-9]{24}$/.test(s);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await getVideoById(id);
        const v = res?.data || null;
        setVideo(v);
        // Initialize like count if backend provides it; else try localStorage fallback
        let initialLikes =
          typeof v?.likes === "number"
            ? v.likes
            : (Array.isArray(v?.likes) ? v.likes.length : (typeof v?.likeCount === "number" ? v.likeCount : null));
        if (!(typeof initialLikes === "number" && Number.isFinite(initialLikes))) {
          try {
            const cached = typeof localStorage !== "undefined" ? localStorage.getItem(`video:likes:${id}`) : null;
            if (cached) initialLikes = Number(cached);
          } catch (_) {}
        }
        setLikeCount((typeof initialLikes === "number" && Number.isFinite(initialLikes)) ? initialLikes : 0);
        setViews(typeof v?.views === "number" ? v.views : null);
        setIsLiked(false);
        
        // Try to derive owner info from the video payload first.
        // Backend may return any of the following shapes:
        // - owner: "<userId>"
        // - owner: { _id, username, fullname, avatar }
        // - ownerId: "<userId>", ownerUsername, ownerFullname, ownerAvatar
        const ownerCandidate =
          (typeof v?.owner === "object" && v.owner) ||
          {
            _id: v?.owner || v?.ownerId,
            username: v?.ownerUsername,
            fullname: v?.ownerFullname,
            avatar: v?.ownerAvatar,
          };

        // If we have at least username or avatar/fullname inline, use it directly.
        if (ownerCandidate && (ownerCandidate.username || ownerCandidate.avatar || ownerCandidate.fullname)) {
          setOwnerInfo(ownerCandidate);
        } else if (ownerCandidate?._id && typeof ownerCandidate._id === "string") {
          // As a last resort, attempt to fetch by ID if backend supports it.
          try {
            const ownerRes = await getUserById(ownerCandidate._id);
            setOwnerInfo(ownerRes?.data || null);
          } catch (ownerError) {
            console.warn("Owner info not available - getUserById endpoint may not be implemented:", ownerError);
            setOwnerInfo(null);
          }
        } else {
          setOwnerInfo(null);
        }
      } catch (e) {
        setError(typeof e === "string" ? e : e?.message || "Failed to load video");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  // Initialize bookmark status
  useEffect(() => {
    if (!isAuthed || !id) return;
    // Prefer cached flag first for instant UX
    try {
      if (typeof localStorage !== "undefined") {
        const cached = localStorage.getItem(`bookmark:${id}`);
        if (cached === "1" || cached === "0") {
          setIsBookmarked(cached === "1");
        }
      }
    } catch (_) {}
    // Then confirm against server
    (async () => {
      try {
        const res = await getMyBookmarks();
        const raw = Array.isArray(res?.data) ? res.data : res?.data?.bookmarks || res?.data || [];
        const ids = raw
          .map((b) => b?.video?._id || b?.video || b?._id)
          .filter(Boolean)
          .map((v) => (typeof v === "string" ? v : String(v)));
        const next = ids.includes(id);
        setIsBookmarked(next);
        try { if (typeof localStorage !== "undefined") localStorage.setItem(`bookmark:${id}`, next ? "1" : "0"); } catch (_) {}
      } catch (_) {
        // ignore; rely on cached value if present
      }
    })();
  }, [isAuthed, id]);

  useEffect(() => {
    const loadLikeStatus = async () => {
      if (!isAuthed || !id) return;
      try {
        const res = await getLikedVideos();
        const list = Array.isArray(res?.data) ? res.data : (res?.data?.likedVideos || []);
        // Be robust to multiple backend shapes
        const likedIds = list
          .map((x) => (
            x?.videoDetails?._id ||
            x?.video?._id ||
            x?.video ||
            x?.videoId ||
            x?._id
          ))
          .filter(Boolean)
          .map((val) => (typeof val === "string" ? val : String(val)));
        setIsLiked(likedIds.includes(id));
      } catch (_) {
        // ignore
      }
    };
    loadLikeStatus();
  }, [isAuthed, id]);

  useEffect(() => {
    const loadSubscriptionStatus = async () => {
      if (!isAuthed || !user?._id || !video) return;
      // Resolve owner id from multiple possible shapes
      const ownerIdCandidate =
        (typeof video?.owner === "object" ? video?.owner?._id : video?.owner) ||
        video?.ownerId ||
        ownerInfo?._id;
      if (!ownerIdCandidate) return;
      try {
        const res = await getSubscribedChannels(user._id);
        const subscribedChannels = Array.isArray(res?.data) ? res.data : (res?.data?.subscribedChannels || []);
        const subscribedIds = subscribedChannels
          .map((x) => x?.channel?._id || x?.channel || x?._id)
          .filter(Boolean)
          .map((s) => (typeof s === "string" ? s : String(s)));
        const normalizedOwnerId = typeof ownerIdCandidate === "string" ? ownerIdCandidate : String(ownerIdCandidate);
        setIsSubscribed(subscribedIds.includes(normalizedOwnerId));
      } catch (_) {
        // ignore
      }
    };
    loadSubscriptionStatus();
  }, [isAuthed, user?._id, video, ownerInfo]);

  // Debounced progress update
  const handleTimeUpdate = () => {
    const el = videoRef.current;
    if (!el || !el.duration || !id) return;
    // Progress updates only for authenticated users
    if (isAuthed) {
      const percent = Math.floor((el.currentTime / el.duration) * 100);
      if (!Number.isNaN(percent)) {
        lastPercentRef.current = percent;
        if (progressTimerRef.current) clearTimeout(progressTimerRef.current);
        progressTimerRef.current = setTimeout(async () => {
          try {
            await updateVideoProgress(id, { percent: lastPercentRef.current });
          } catch (_) {
            // ignore
          }
        }, 1500);
      }
    }

    // One-time unique view after 10s watch time (per session) for all users
    if (!viewSentRef.current && el.currentTime >= 10) {
      const key = `viewed:${id}`;
      if (typeof sessionStorage !== "undefined" && sessionStorage.getItem(key)) {
        viewSentRef.current = true;
      } else {
        viewSentRef.current = true; // avoid duplicate triggers
        axios
          .patch(`/videos/addview/${id}`)
          .then((resp) => {
            try {
              if (typeof sessionStorage !== "undefined") sessionStorage.setItem(key, "1");
            } catch (_) {}
            const next = resp?.data?.views;
            if (typeof next === "number") {
              setViews(next);
            } else {
              setViews((v) => (typeof v === "number" ? v + 1 : v));
            }
          })
          .catch((e) => {
            console.warn("Failed to add view:", e);
          });
      }
    }
  };

  const handlePlay = async () => {
    setIsPlaying(true);
    if (!id) return;
    if (!hasSentInitialRef.current) {
      hasSentInitialRef.current = true;
      // Auth-only initial progress bump
      if (isAuthed) {
        try {
          await updateVideoProgress(id, { percent: 1 });
        } catch (e) {
          console.warn("Initial progress update failed:", e);
        }
      }
      // Optimistic unique view on play (with session guard) for all users
      try {
        const key = `viewed:${id}`;
        const already = typeof sessionStorage !== "undefined" && sessionStorage.getItem(key);
        if (!viewSentRef.current && !already) {
          viewSentRef.current = true;
          setViews((v) => (typeof v === "number" ? v + 1 : 1));
          axios
            .patch(`/videos/addview/${id}`)
            .then((resp) => {
              try { if (typeof sessionStorage !== "undefined") sessionStorage.setItem(key, "1"); } catch (_) {}
              const next = resp?.data?.views;
              if (typeof next === "number") setViews(next);
            })
            .catch((e) => {
              console.warn("Failed to add view on play:", e);
            });
        }
      } catch (_) {
        // ignore
      }
    }
  };

  const handlePause = () => {
    setIsPlaying(false);
  };

  const handleEnded = async () => {
    if (!isAuthed || !id) return;
    try {
      await updateVideoProgress(id, { percent: 100 });
    } catch (_) {
      // ignore
    } finally {
      // Redirect to quiz for this video
      navigate(`/quizzes/${id}`);
    }
  };

  const onTotalCommentsChange = (total) => setCommentCount(total || 0);

  const onToggleLike = async () => {
    if (!isAuthed) return;
    setLiking(true);
    const nextLiked = !isLiked;
    setLikeCount((c) => {
      const next = nextLiked ? (c ?? 0) + 1 : Math.max(0, (c ?? 0) - 1);
      try { if (typeof localStorage !== "undefined") localStorage.setItem(`video:likes:${id}`, String(next)); } catch (_) {}
      return next;
    });
    setIsLiked(nextLiked);
    try {
      await toggleLikeVideo(id);
      // Refetch to get authoritative like count from backend
      try {
        const res = await getVideoById(id);
        const v = res?.data || null;
        if (v) {
          setVideo(v);
          const freshLikes =
            typeof v?.likes === "number"
              ? v.likes
              : (Array.isArray(v?.likes) ? v.likes.length : (typeof v?.likeCount === "number" ? v.likeCount : null));
          if (typeof freshLikes === "number" && Number.isFinite(freshLikes)) {
            setLikeCount(() => {
              try { if (typeof localStorage !== "undefined") localStorage.setItem(`video:likes:${id}`, String(freshLikes)); } catch (_) {}
              return freshLikes;
            });
          }
        }
      } catch (_) {
        // ignore refetch failure; keep optimistic value
      }
    } catch (e) {
      // revert on failure
      setIsLiked(!nextLiked);
      setLikeCount((c) => {
        const next = !nextLiked ? (c ?? 0) + 1 : Math.max(0, (c ?? 0) - 1);
        try { if (typeof localStorage !== "undefined") localStorage.setItem(`video:likes:${id}`, String(next)); } catch (_) {}
        return next;
      });
    } finally {
      setLiking(false);
    }
  };

  const onToggleBookmark = async () => {
    if (!isAuthed) return;
    if (!isValidObjectIdStr(id)) return; // avoid bad requests
    const next = !isBookmarked;
    setIsBookmarked(next);
    try {
      if (next) await addBookmark(id);
      else await removeBookmark(id);
      try { if (typeof localStorage !== "undefined") localStorage.setItem(`bookmark:${id}`, next ? "1" : "0"); } catch (_) {}
    } catch (_) {
      setIsBookmarked(!next);
      try { if (typeof localStorage !== "undefined") localStorage.setItem(`bookmark:${id}`, (!next) ? "1" : "0"); } catch (_) {}
    }
  };

  const onToggleSubscription = async () => {
    if (!isAuthed || subscribing) return;
    // Resolve owner/channel id robustly from multiple shapes
    const ownerIdCandidate =
      (typeof video?.owner === "object" ? video?.owner?._id : video?.owner) ||
      video?.ownerId ||
      ownerInfo?._id;
    if (!ownerIdCandidate) return;
    const channelId = typeof ownerIdCandidate === "string" ? ownerIdCandidate : String(ownerIdCandidate);

    setSubscribing(true);
    const nextSubscribed = !isSubscribed;
    setIsSubscribed(nextSubscribed);
    try {
      await toggleSubscription(channelId);
    } catch (e) {
      // revert on failure
      setIsSubscribed(!nextSubscribed);
      console.error("Failed to toggle subscription:", e);
    } finally {
      setSubscribing(false);
    }
  };

  const openPlaylistModal = async () => {
    if (!isAuthed) return;
    setShowPlaylistModal(true);
    setShowCreateForm(false);
    setNewPlaylistName("");
    setNewPlaylistDescription("");
    setLoadingPlaylists(true);
    try {
      const res = await getMyPlaylists();
      const data = Array.isArray(res?.data) ? res.data : res?.data?.playlists || res?.data || [];
      setMyPlaylists(data);
    } catch (e) {
      setMyPlaylists([]);
    } finally {
      setLoadingPlaylists(false);
    }
  };

  const closePlaylistModal = () => {
    setShowPlaylistModal(false);
  };

  const handleCreatePlaylistAndAdd = async () => {
    if (!newPlaylistName.trim() || !newPlaylistDescription.trim()) return;
    setCreatingPlaylist(true);
    try {
      await createPlaylist({
        name: newPlaylistName.trim(),
        description: newPlaylistDescription.trim(),
        videos: [id],
      });
      alert("Playlist created and video added");
      closePlaylistModal();
    } catch (e) {
      alert(typeof e === "string" ? e : e?.message || "Failed to create playlist");
    } finally {
      setCreatingPlaylist(false);
    }
  };

  const handleAddToExisting = async (playlistId) => {
    try {
      await addVideoToPlaylist(playlistId, id);
      alert("Video added to playlist");
      closePlaylistModal();
    } catch (e) {
      alert(typeof e === "string" ? e : e?.message || "Failed to add to playlist");
    }
  };

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto bg-white shadow rounded-lg p-6 text-center text-gray-600">
        Loading video...
      </div>
    );
  }

  if (error || !video) {
    return (
      <div className="max-w-5xl mx-auto bg-white shadow rounded-lg p-6 text-center">
        <p className="text-red-600">{error || "Video not found"}</p>
        <Link to="/" className="text-indigo-600 hover:text-indigo-700 inline-block mt-4">Back to Videos</Link>
      </div>
    );
  }

  const likeButtonClasses = !isAuthed
    ? "px-4 py-2 rounded bg-gray-300 text-gray-600 cursor-not-allowed"
    : isLiked
    ? "px-4 py-2 rounded bg-red-600 text-white hover:bg-red-700"
    : "px-4 py-2 rounded bg-indigo-600 text-white hover:bg-indigo-700";

  const bookmarkButtonClasses = !isAuthed
    ? "px-4 py-2 rounded bg-gray-300 text-gray-600 cursor-not-allowed"
    : isBookmarked
    ? "px-4 py-2 rounded bg-yellow-500 text-white hover:bg-yellow-600"
    : "px-4 py-2 rounded bg-gray-800 text-white hover:bg-gray-900";

  // IDs for subscription button logic
  const viewerId = user?._id ? (typeof user._id === "string" ? user._id : String(user._id)) : null;
  const ownerIdForTop =
    (typeof video?.owner === "object" ? video?.owner?._id : video?.owner) ||
    video?.ownerId ||
    ownerInfo?._id;
  const channelIdForTop = ownerIdForTop ? (typeof ownerIdForTop === "string" ? ownerIdForTop : String(ownerIdForTop)) : null;

  return (
    <div className="max-w-[960px] mx-auto space-y-6 px-4 md:px-0">
      <div className="bg-[#fcf8f8] rounded-lg p-4">
        <div className="aspect-video w-full rounded-2xl overflow-hidden relative bg-[#000] shadow-lg group">
          <video
            ref={videoRef}
            src={video.videofile}
            controls
            className="w-full h-full object-cover rounded-2xl transition-all duration-300 group-hover:brightness-90"
            onPlay={handlePlay}
            onPause={handlePause}
            onTimeUpdate={handleTimeUpdate}
            onEnded={handleEnded}
            poster={video.thumbnail}
            style={{ background: '#111' }}
          />
          {/* Custom Play Overlay: only show when paused */}
          {!isPlaying && (
            <button
              type="button"
              aria-label="Play video"
              onClick={() => videoRef.current && videoRef.current.play()}
              className="absolute inset-0 flex items-center justify-center z-10 opacity-100 group-hover:opacity-100 transition-opacity duration-300"
              tabIndex={-1}
              style={{ pointerEvents: 'auto' }}
            >
              <span className="bg-black/60 rounded-full p-4 flex items-center justify-center shadow-lg">
                <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="24" cy="24" r="24" fill="#fff" fillOpacity="0.15" />
                  <path d="M20 16L32 24L20 32V16Z" fill="#fff" />
                </svg>
              </span>
            </button>
          )}
          {/* Views badge */}
          {typeof views === "number" && (
            <div className="absolute top-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
              {views.toLocaleString()} views
            </div>
          )}
        </div>
        <h1 className="mt-5 px-4 text-[22px] font-bold leading-tight tracking-[-0.015em] text-[#1b0e0e]">{video.title}</h1>
        <p className="px-4 pt-1 pb-3 text-sm text-[#994d51]">
          {`${typeof views === "number" ? views.toLocaleString() + " views" : "— views"} · ${video.timeAgo || ""} ${video.timeAgo ? "· " : ""}Category: ${video.category || "—"} · Difficulty: ${video.difficulty || "—"} · Duration: ${ensureHMS(video.duration)} · ${video.isPublished ? "Published" : "Draft"}`}
        </p>

        <div className="@container">
          <div className="px-4 flex flex-wrap justify-start gap-3">
            <div className="flex flex-col items-center gap-1.5 bg-[#fcf8f8] py-2.5 text-center w-24">
              <button onClick={onToggleLike} disabled={!isAuthed || liking} className="rounded-full bg-[#f3e7e8] p-2.5 disabled:opacity-50 hover:shadow">
                <span className="text-[#1b0e0e]">👍</span>
              </button>
              <p className="text-[#1b0e0e] text-sm font-medium leading-normal">{isLiked ? "Unlike" : "Like"}</p>
              <p className="text-[#994d51] text-xs leading-normal">{typeof likeCount === 'number' ? likeCount : 0} likes</p>
            </div>
            <div className="flex flex-col items-center gap-1.5 bg-[#fcf8f8] py-2.5 text-center w-28">
              <button onClick={onToggleBookmark} disabled={!isAuthed} className="rounded-full bg-[#f3e7e8] p-2.5 disabled:opacity-50 hover:shadow">
                <span className="text-[#1b0e0e]">🔖</span>
              </button>
              <p className="text-[#1b0e0e] text-sm font-medium leading-normal">{isBookmarked ? "Bookmarked" : "Bookmark"}</p>
            </div>
            <div className="flex flex-col items-center gap-1.5 bg-[#fcf8f8] py-2.5 text-center w-36">
              <button onClick={openPlaylistModal} disabled={!isAuthed} className="rounded-full bg-[#f3e7e8] p-2.5 disabled:opacity-50 hover:shadow">
                <span className="text-[#1b0e0e]">➕</span>
              </button>
              <p className="text-[#1b0e0e] text-sm font-medium leading-normal">Add to playlist</p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-[#fcf8f8] rounded-lg p-4">
        <h2 className="text-lg font-bold text-[#1b0e0e] mb-2 px-1">More</h2>
        {(() => {
          const ownerId =
            (typeof video?.owner === "object" ? video?.owner?._id : video?.owner) ||
            video?.ownerId ||
            ownerInfo?._id;
          const ownerUsername = ownerInfo?.username || (typeof video?.owner === "object" ? video?.owner?.username : video?.ownerUsername);
          const ownerFullname = ownerInfo?.fullname || (typeof video?.owner === "object" ? video?.owner?.fullname : video?.ownerFullname) || ownerUsername;
          const ownerAvatar = ownerInfo?.avatar || (typeof video?.owner === "object" ? video?.owner?.avatar : video?.ownerAvatar);
          const viewerId = user?._id ? (typeof user._id === "string" ? user._id : String(user._id)) : null;
          const channelId = ownerId ? (typeof ownerId === "string" ? ownerId : String(ownerId)) : null;

          const profileBlock = (
            <div className="flex items-center gap-4">
              <img
                src={ownerAvatar || '/default-avatar.png'}
                alt={ownerUsername || ownerId || 'channel-avatar'}
                className="h-14 w-14 rounded-full object-cover"
                onError={(e) => { e.currentTarget.src = '/default-avatar.png'; }}
              />
              <div className="flex flex-col justify-center">
                <p className="text-[#1b0e0e] text-base font-medium leading-normal line-clamp-1">{ownerFullname || 'Channel'}</p>
                <p className="text-[#994d51] text-sm leading-normal line-clamp-2">{ownerUsername ? `@${ownerUsername}` : `ID: ${ownerId || '-'}`}</p>
              </div>
            </div>
          );

          return (
            <div className="flex items-center justify-between bg-[#fcf8f8] px-2 py-2">
              {ownerUsername ? (
                <Link to={`/u/${ownerUsername}`} className="hover:bg-gray-50 rounded-lg p-2 -m-2 transition-colors">
                  {profileBlock}
                </Link>
              ) : (
                profileBlock
              )}
              {isAuthed && channelId && viewerId && viewerId !== channelId && (
                <button
                  onClick={onToggleSubscription}
                  disabled={subscribing}
                  className={`min-w-[84px] h-8 px-4 rounded-lg text-sm ${
                    isSubscribed ? 'bg-gray-200 text-gray-800 hover:bg-gray-300' : 'bg-[#f3e7e8] text-[#1b0e0e]'
                  } disabled:opacity-50`}
                >
                  {subscribing ? '...' : isSubscribed ? 'Subscribed' : 'Subscribe'}
                </button>
              )}
            </div>
          );
        })()}
      </div>

      <div className="bg-[#fcf8f8] rounded-lg p-4">
        <h3 className="text-[#1b0e0e] text-lg font-bold leading-tight tracking-[-0.015em] mb-2">Comments</h3>
        <VideoComments videoId={id} currentUserId={user?._id} onTotalChange={onTotalCommentsChange} />
      </div>
      {showPlaylistModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white w-full max-w-md rounded-lg shadow-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold text-gray-900">Add to Playlist</h3>
              <button onClick={closePlaylistModal} className="text-gray-500 hover:text-gray-700">✕</button>
            </div>

            {loadingPlaylists ? (
              <div className="text-gray-600">Loading...</div>
            ) : (
              <div className="space-y-3">
                {myPlaylists.length === 0 ? (
                  <div>
                    <div className="text-sm text-gray-700 mb-2">You have no playlists. Create one to add this video.</div>
                    <div className="space-y-2">
                      <input
                        placeholder="Playlist name"
                        value={newPlaylistName}
                        onChange={(e) => setNewPlaylistName(e.target.value)}
                        className="border rounded p-2 w-full text-sm"
                      />
                      <input
                        placeholder="Description"
                        value={newPlaylistDescription}
                        onChange={(e) => setNewPlaylistDescription(e.target.value)}
                        className="border rounded p-2 w-full text-sm"
                      />
                      <button
                        onClick={handleCreatePlaylistAndAdd}
                        disabled={creatingPlaylist}
                        className="w-full px-4 py-2 bg-indigo-600 text-white rounded disabled:opacity-50"
                      >
                        {creatingPlaylist ? "Creating..." : "Create and Add"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <button
                      onClick={() => setShowCreateForm((v) => !v)}
                      className="w-full px-3 py-2 text-sm bg-gray-100 rounded hover:bg-gray-200 text-left"
                    >
                      {showCreateForm ? "Hide" : "➕ Create new playlist"}
                    </button>
                    {showCreateForm && (
                      <div className="space-y-2">
                        <input
                          placeholder="Playlist name"
                          value={newPlaylistName}
                          onChange={(e) => setNewPlaylistName(e.target.value)}
                          className="border rounded p-2 w-full text-sm"
                        />
                        <input
                          placeholder="Description"
                          value={newPlaylistDescription}
                          onChange={(e) => setNewPlaylistDescription(e.target.value)}
                          className="border rounded p-2 w-full text-sm"
                        />
                        <button
                          onClick={handleCreatePlaylistAndAdd}
                          disabled={creatingPlaylist}
                          className="w-full px-4 py-2 bg-indigo-600 text-white rounded disabled:opacity-50"
                        >
                          {creatingPlaylist ? "Creating..." : "Create and Add"}
                        </button>
                      </div>
                    )}
                    <div className="max-h-60 overflow-y-auto divide-y">
                      {myPlaylists.map((p) => (
                        <div key={p._id} className="py-2 flex items-center justify-between">
                          <div>
                            <div className="font-medium text-gray-900 text-sm">{p.name}</div>
                            <div className="text-xs text-gray-600 line-clamp-1">{p.description}</div>
                          </div>
                          <button
                            onClick={() => handleAddToExisting(p._id)}
                            className="px-3 py-1 text-sm bg-green-600 text-white rounded"
                          >
                            Add here
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default VideoDetail;
