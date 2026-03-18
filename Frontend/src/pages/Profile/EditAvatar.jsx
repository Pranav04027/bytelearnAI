import { useState } from "react";
import { updateAvatar } from "../../api/auth.js";
import { Link } from "react-router-dom";

const EditAvatar = () => {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const onFile = (e) => {
    const f = e.target.files?.[0];
    setFile(f || null);
    setSuccess(false);
    setError("");
    if (f) {
      const url = URL.createObjectURL(f);
      setPreview(url);
    } else {
      setPreview("");
    }
  };

  const onSave = async () => {
    if (!file) return;
    const fd = new FormData();
    fd.append("avatar", file);
    setSaving(true);
    setError("");
    setSuccess(false);
    try {
      await updateAvatar(fd);
      setSuccess(true);
    } catch (e) {
      setError(typeof e === "string" ? e : e?.message || "Failed to update avatar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-md mx-auto bg-white shadow rounded-lg p-6">
      <h1 className="text-xl font-semibold text-gray-900 mb-4">Update Avatar</h1>
      <input type="file" accept="image/*" onChange={onFile} />
      {preview && (
        <img src={preview} alt="preview" className="mt-4 w-32 h-32 object-cover rounded-full" />
      )}
      <div className="mt-4 flex gap-2">
        <button className="px-4 py-2 bg-indigo-600 text-white rounded disabled:opacity-50" onClick={onSave} disabled={!file || saving}>
          {saving ? "Saving..." : "Save"}
        </button>
        <Link to="/profile" className="px-4 py-2 bg-gray-100 rounded">Back</Link>
      </div>
      {error && <div className="mt-3 text-sm text-red-600">{error}</div>}
      {success && <div className="mt-3 text-sm text-green-700">Avatar updated.</div>}
    </div>
  );
};

export default EditAvatar;
