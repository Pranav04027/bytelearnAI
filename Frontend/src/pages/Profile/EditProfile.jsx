import { useEffect, useState } from "react";
import useAuth from "../../hooks/useAuth.js";
import { updateAccountDetails, changePassword } from "../../api/auth.js";
import { Link } from "react-router-dom";

const EditProfile = () => {
  const { user, setUser } = useAuth();

  const [prevUsername, setPrevUsername] = useState("");
  const [prevEmail, setPrevEmail] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [newEmail, setNewEmail] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Change password state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError, setPwError] = useState("");
  const [pwSuccess, setPwSuccess] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    setPrevUsername(user?.username || "");
    setPrevEmail(user?.email || "");
    setNewUsername(user?.username || "");
    setNewEmail(user?.email || "");
  }, [user]);

  const isUsernameValid = (val) => {
    if (!val) return false;
    // allow letters, numbers, underscore; 3-20 chars
    return /^[a-zA-Z0-9_]{3,20}$/.test(val);
  };

  const isPasswordStrong = (val) => {
    // min 8, at least 1 letter and 1 number
    return /^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(val || "");
  };

  const onChangePassword = async () => {
    setPwSaving(true);
    setPwError("");
    setPwSuccess("");

    if (!currentPassword || !newPassword || !confirmPassword) {
      setPwSaving(false);
      setPwError("Please fill in all password fields");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwSaving(false);
      setPwError("New password and confirm password do not match");
      return;
    }
    if (!isPasswordStrong(newPassword)) {
      setPwSaving(false);
      setPwError("Password must be at least 8 characters and include a letter and a number");
      return;
    }

    try {
      await changePassword({ currentPassword, newPassword });
      setPwSuccess("Password changed successfully");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (e) {
      setPwError(typeof e === "string" ? e : e?.message || "Failed to change password");
    } finally {
      setPwSaving(false);
    }
  };

  const isEmailValid = (val) => {
    if (!val) return false;
    // simple email pattern
    return /.+@.+\..+/.test(val);
  };

  const onSave = async () => {
    setSaving(true);
    setError("");
    setSuccess("");

    const payload = {};
    const usernameChanged = newUsername && newUsername !== prevUsername;
    const emailChanged = newEmail && newEmail !== prevEmail;

    if (!usernameChanged && !emailChanged) {
      setSaving(false);
      setError("No changes to save");
      return;
    }

    if (usernameChanged && !isUsernameValid(newUsername)) {
      setSaving(false);
      setError("Username must be 3-20 characters and can contain letters, numbers, and underscores");
      return;
    }
    if (emailChanged && !isEmailValid(newEmail)) {
      setSaving(false);
      setError("Please enter a valid email address");
      return;
    }

    if (usernameChanged) payload.username = newUsername;
    if (emailChanged) payload.email = newEmail;

    try {
      await updateAccountDetails(payload);
      // Optimistically update local auth context
      setUser?.({
        ...user,
        ...(usernameChanged ? { username: newUsername } : {}),
        ...(emailChanged ? { email: newEmail } : {}),
      });
      setSuccess("Profile updated successfully.");
    } catch (e) {
      setError(typeof e === "string" ? e : e?.message || "Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-3 md:p-4">
      <div className="bg-white/70 shadow-sm rounded-xl p-4 md:p-6">
        <h1 className="text-[#1b0e0e] tracking-light text-[24px] md:text-[28px] font-bold leading-tight mb-4">Edit Profile</h1>

        {/* Account details */}
        <div className="grid grid-cols-1 gap-4">
          <div>
            <label className="block text-xs font-medium text-[#994d51]">Previous Username</label>
            <input
              className="mt-1 border rounded-lg p-2 w-full bg-[#f3e7e8] text-[#1b0e0e]/70"
              value={prevUsername}
              disabled
              aria-readonly
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#994d51]">New Username</label>
            <input
              className="mt-1 border rounded-lg p-2 w-full"
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              placeholder="Enter new username"
            />
            <p className="mt-1 text-xs text-[#1b0e0e]/60">Allowed: letters, numbers, underscore. 3-20 characters.</p>
          </div>

          <div className="pt-2 border-t" />

          <div>
            <label className="block text-xs font-medium text-[#994d51]">Previous Email</label>
            <input
              className="mt-1 border rounded-lg p-2 w-full bg-[#f3e7e8] text-[#1b0e0e]/70"
              value={prevEmail}
              disabled
              aria-readonly
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#994d51]">New Email</label>
            <input
              className="mt-1 border rounded-lg p-2 w-full"
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>
        </div>

        <div className="flex gap-2 mt-4">
          <button
            className="px-4 py-2 bg-[#f3e7e8] text-[#1b0e0e] rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50"
            disabled={saving}
            onClick={onSave}
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
          <Link to="/profile" className="px-4 py-2 bg-[#f3e7e8] text-[#1b0e0e] rounded-lg text-sm font-medium hover:opacity-90">Back</Link>
        </div>

        {error && <div className="mt-3 text-sm text-red-600">{error}</div>}
        {success && <div className="mt-3 text-sm text-green-700">{success}</div>}

        <p className="mt-3 text-xs text-[#1b0e0e]/60">
          Changing your username will also change your channel URL (e.g., /u/your_new_username).
        </p>

        {/* Change Password */}
        <div className="mt-6 pt-4 border-t">
          <h2 className="text-[#1b0e0e] text-[18px] font-semibold mb-3">Change Password</h2>
          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#994d51]">Current Password</label>
              <div className="mt-1 relative">
                <input
                  className="border rounded-lg p-2 w-full pr-20"
                  type={showCurrent ? "text" : "password"}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter current password"
                  autoComplete="off"
                  name="current_pw"
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 text-xs bg-[#f3e7e8] text-[#1b0e0e] rounded"
                  onClick={() => setShowCurrent((s) => !s)}
                >
                  {showCurrent ? "Hide" : "Show"}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-[#994d51]">New Password</label>
              <div className="mt-1 relative">
                <input
                  className="border rounded-lg p-2 w-full pr-20"
                  type={showNew ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="At least 8 chars, include letters and numbers"
                  autoComplete="new-password"
                  name="new_pw"
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 text-xs bg-[#f3e7e8] text-[#1b0e0e] rounded"
                  onClick={() => setShowNew((s) => !s)}
                >
                  {showNew ? "Hide" : "Show"}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-[#994d51]">Confirm New Password</label>
              <div className="mt-1 relative">
                <input
                  className="border rounded-lg p-2 w-full pr-20"
                  type={showConfirm ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter new password"
                  autoComplete="new-password"
                  name="confirm_pw"
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 text-xs bg-[#f3e7e8] text-[#1b0e0e] rounded"
                  onClick={() => setShowConfirm((s) => !s)}
                >
                  {showConfirm ? "Hide" : "Show"}
                </button>
              </div>
            </div>
          </div>

          <div className="flex gap-2 mt-4">
            <button
              className="px-4 py-2 bg-[#f3e7e8] text-[#1b0e0e] rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50"
              disabled={pwSaving}
              onClick={onChangePassword}
            >
              {pwSaving ? "Updating..." : "Update Password"}
            </button>
          </div>

          {pwError && <div className="mt-3 text-sm text-red-600">{pwError}</div>}
          {pwSuccess && <div className="mt-3 text-sm text-green-700">{pwSuccess}</div>}
        </div>
      </div>
    </div>
  );
};

export default EditProfile;
