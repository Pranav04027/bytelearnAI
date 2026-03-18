// Frontend-only playlist bookmarks using localStorage
// Each item: { _id, name, description, ownerId, ownerUsername }

const STORAGE_KEY = "playlistBookmarks";

const read = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const write = (arr) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(arr || []));
  } catch {}
};

export const getPlaylistBookmarks = () => read();

export const isPlaylistBookmarked = (playlistId) => {
  if (!playlistId) return false;
  return read().some((p) => p?._id === playlistId);
};

export const addPlaylistBookmark = (playlist) => {
  if (!playlist || !playlist._id) return;
  const list = read();
  if (list.some((p) => p._id === playlist._id)) return;
  list.push({
    _id: playlist._id,
    name: playlist.name || "Untitled",
    description: playlist.description || "",
    ownerId: playlist.ownerId || playlist.userId || playlist.user || null,
    ownerUsername: playlist.ownerUsername || playlist.username || playlist.user?.username || null,
  });
  write(list);
};

export const removePlaylistBookmark = (playlistId) => {
  if (!playlistId) return;
  const list = read().filter((p) => p._id !== playlistId);
  write(list);
};
