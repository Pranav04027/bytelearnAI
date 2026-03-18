import { useEffect, useMemo, useState, useCallback } from "react";
import { getVideoComments, addComment, updateComment, deleteComment } from "../../api/comments.js";
import { toggleLikeComment } from "../../api/likes.js";
import useAuth from "../../hooks/useAuth.js";
import { Link } from "react-router-dom";

const CommentItem = ({ comment, isOwner, isAuthed, onEdit, onDelete, onToggleLike }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [text, setText] = useState(comment.content);

  const save = async () => {
    if (!isAuthed) return;
    await onEdit(comment._id, text);
    setIsEditing(false);
  };

  return (
    <div className="p-3 border rounded">
      {!isEditing ? (
        <p className="text-sm text-gray-900 whitespace-pre-wrap">{comment.content}</p>
      ) : (
        <div className="space-y-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="w-full border rounded p-2 text-sm"
            rows={3}
          />
          <div className="flex gap-2">
            <button onClick={save} disabled={!isAuthed} className="px-3 py-1 text-xs bg-indigo-600 text-white rounded disabled:opacity-50">Save</button>
            <button onClick={() => setIsEditing(false)} className="px-3 py-1 text-xs bg-gray-200 rounded">Cancel</button>
          </div>
        </div>
      )}

      {!isEditing && (
        <div className="mt-2 flex items-center gap-3">
          {isOwner && (
            <>
              <button onClick={() => isAuthed && setIsEditing(true)} disabled={!isAuthed} className="text-xs text-indigo-600 disabled:opacity-50">Edit</button>
              <button onClick={() => isAuthed && onDelete(comment._id)} disabled={!isAuthed} className="text-xs text-red-600 disabled:opacity-50">Delete</button>
            </>
          )}
          <button
            onClick={() => isAuthed && onToggleLike(comment._id)}
            disabled={!isAuthed}
            className={`text-xs px-2 py-1 rounded border ${comment.__isLiked ? "bg-red-50 text-red-600 border-red-200" : "bg-gray-50 border-gray-200"} disabled:opacity-50`}
          >
            {comment.__isLiked ? "Unlike" : "Like"}
          </button>
          <span className="text-xs text-gray-700">Likes: <span className="text-gray-900">{comment.__likeCount ?? 0}</span></span>
        </div>
      )}
    </div>
  );
};

const VideoComments = ({ videoId, currentUserId, onTotalChange }) => {
  const { user } = useAuth();
  const isAuthed = Boolean(user);

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [total, setTotal] = useState(0);
  const [newComment, setNewComment] = useState("");

  const emitTotal = useCallback((value) => {
    setTotal(value || 0);
    if (typeof onTotalChange === "function") {
      onTotalChange(value || 0);
    }
  }, [onTotalChange]);

  const fetchComments = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await getVideoComments(videoId, page, limit);
      const data = res?.data || {};
      const list = (data.all_comments || []).map((c) => {
        const serverCount = typeof c.likes === "number"
          ? c.likes
          : Array.isArray(c.likes)
            ? c.likes.length
            : (typeof c.likeCount === "number" ? c.likeCount : 0);
        let serverIsLiked = false;
        if (Array.isArray(c.likes) && user?._id) {
          const uid = typeof user._id === "string" ? user._id : String(user._id);
          // likes array can contain ids or objects; try to normalize
          const likedSet = new Set(
            c.likes.map((v) => {
              const id = (typeof v === "string") ? v : (v?._id || v?.likedBy?._id || v?.likedBy || v?.user || v);
              return typeof id === "string" ? id : String(id);
            })
          );
          serverIsLiked = likedSet.has(uid);
        }
        // read cache overrides
        let cachedLiked = null;
        let cachedCount = null;
        try {
          if (typeof localStorage !== "undefined") {
            const l = localStorage.getItem(`comment:liked:${c._id}`);
            const cnt = localStorage.getItem(`comment:likes:${c._id}`);
            if (l === "1" || l === "0") cachedLiked = l === "1";
            if (cnt !== null && cnt !== undefined) cachedCount = Number(cnt);
          }
        } catch (_) {}
        return {
          ...c,
          __likeCount: (typeof cachedCount === "number" && Number.isFinite(cachedCount)) ? cachedCount : serverCount,
          __isLiked: (typeof cachedLiked === "boolean") ? cachedLiked : serverIsLiked,
        };
      });

      // ensure unique comments by _id
      const uniqueList = Array.from(new Map(list.map((c) => [c._id, c])).values());
      setItems(uniqueList);
      emitTotal(data.totalComments || 0);
    } catch (e) {
      setError(typeof e === "string" ? e : e?.message || "Failed to load comments");
    } finally {
      setLoading(false);
    }
  }, [videoId, page, limit, emitTotal, user]);

  useEffect(() => {
    if (videoId) fetchComments();
  }, [videoId, page, fetchComments]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / limit)), [total, limit]);

  const submit = async () => {
    if (!isAuthed || !newComment.trim()) return;
    try {
      await addComment(videoId, { content: newComment.trim() });
      setNewComment("");
      fetchComments();
    } catch (e) {
      alert(typeof e === "string" ? e : e?.message || "Failed to add comment");
    }
  };

  const onEdit = async (commentId, content) => {
    if (!isAuthed) return;
    try {
      await updateComment(commentId, { content });
      setItems((prev) => prev.map((c) => (c._id === commentId ? { ...c, content } : c)));
    } catch (e) {
      alert(typeof e === "string" ? e : e?.message || "Failed to update comment");
    }
  };

  const onDelete = async (commentId) => {
    if (!isAuthed) return;
    try {
      await deleteComment(commentId);
      setItems((prev) => prev.filter((c) => c._id !== commentId));
      emitTotal(total - 1);
    } catch (e) {
      alert(typeof e === "string" ? e : e?.message || "Failed to delete comment");
    }
  };

  const onToggleLike = async (commentId) => {
    if (!isAuthed) return;
    // optimistic update
    setItems((prev) => prev.map((c) => {
      if (c._id !== commentId) return c;
      const nextLiked = !c.__isLiked;
      const nextCount = nextLiked
        ? (c.__likeCount ?? 0) + 1
        : Math.max(0, (c.__likeCount ?? 0) - 1);
      try {
        if (typeof localStorage !== "undefined") {
          localStorage.setItem(`comment:liked:${commentId}`, nextLiked ? "1" : "0");
          localStorage.setItem(`comment:likes:${commentId}`, String(nextCount));
        }
      } catch (_) {}
      return { ...c, __isLiked: nextLiked, __likeCount: nextCount };
    }));
    try {
      await toggleLikeComment(commentId);
    } catch (e) {
      // revert on failure
      setItems((prev) => prev.map((c) => {
        if (c._id !== commentId) return c;
        const nextLiked = !c.__isLiked;
        const nextCount = nextLiked
          ? (c.__likeCount ?? 0) + 1
          : Math.max(0, (c.__likeCount ?? 0) - 1);
        try {
          if (typeof localStorage !== "undefined") {
            localStorage.setItem(`comment:liked:${commentId}`, nextLiked ? "1" : "0");
            localStorage.setItem(`comment:likes:${commentId}`, String(nextCount));
          }
        } catch (_) {}
        return { ...c, __isLiked: nextLiked, __likeCount: nextCount };
      }));
      alert(typeof e === "string" ? e : e?.message || "Failed to like comment");
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-gray-900">Comments</h2>

      {!isAuthed && (
        <div className="p-3 border rounded bg-gray-50 text-sm text-gray-700">
          Please <Link to="/login" className="text-indigo-600">login</Link> to participate in the discussion.
        </div>
      )}

      <div className="flex gap-2">
        <input
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder={isAuthed ? "Add a comment" : "Login to comment"}
          className="flex-1 border rounded p-2 text-sm"
          disabled={!isAuthed}
        />
        <button onClick={submit} disabled={!isAuthed} className="px-4 py-2 bg-indigo-600 text-white rounded disabled:opacity-50">
          Comment
        </button>
      </div>

      {loading && <div className="text-gray-600">Loading comments...</div>}
      {error && <div className="text-red-600">{error}</div>}

      {!loading && !error && (
        <div className="space-y-3">
          {items.map((c) => (
            <CommentItem
              key={c._id}
              comment={c}
              isOwner={c.owner === currentUserId}
              isAuthed={isAuthed}
              onEdit={onEdit}
              onDelete={onDelete}
              onToggleLike={onToggleLike}
            />
          ))}
        </div>
      )}

      <div className="flex items-center justify-between pt-2">
        <button
          disabled={page <= 1}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          className="px-3 py-1 text-sm bg-gray-200 rounded disabled:opacity-50"
        >
          Prev
        </button>
        <span className="text-sm text-gray-600">
          Page {page} of {totalPages}
        </span>
        <button
          disabled={page >= totalPages}
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          className="px-3 py-1 text-sm bg-gray-200 rounded disabled:opacity-50"
        >
          Next
        </button>
      </div>
    </div>
  );
};

export default VideoComments;