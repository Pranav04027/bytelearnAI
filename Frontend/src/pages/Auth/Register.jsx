import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { registerUser } from "../../api/auth.js";
import { createUploadUrl, uploadWithPresignedPut } from "../../api/awsS3.js";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

const Register = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    fullname: "",
    username: "",
    email: "",
    password: "",
    role: "learner",
  });
  const [avatar, setAvatar] = useState(null);
  const [coverImage, setCoverImage] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleFileChange = (e, type) => {
    const file = e.target.files?.[0] || null;

    if (file && file.size > MAX_IMAGE_BYTES) {
      setError("Image size should be less than 8MB.");
      return;
    }
    setError("");
    if (type === "avatar") setAvatar(file);
    if (type === "coverImage") setCoverImage(file);
  };

  const uploadPublicImage = async (file, mediaType = "avatar") => {
    const presign = await createUploadUrl({
      mediaType,
      fileName: file.name,
      contentType: file.type || "image/jpeg",
      fileSize: file.size,
    });
    const presignData = presign?.data || {};

    await uploadWithPresignedPut(
      presignData.uploadUrl,
      file,
      file.type || "image/jpeg",
      presignData.headers || {}
    );

    return presignData.publicUrl;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (!avatar) {
        throw new Error("Avatar is required.");
      }

      const avatarUrl = await uploadPublicImage(avatar, "avatar");
      const coverImageUrl = coverImage ? await uploadPublicImage(coverImage, "coverimage") : "";

      const registrationPayload = {
        ...formData,
        avatarUrl,
        coverImageUrl,
      };

      await registerUser(registrationPayload);
      navigate("/login");
    } catch (err) {
      const errorMessage =
        err?.response?.data?.message ||
        err?.data?.message ||
        err?.message ||
        "Registration failed";

      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#fcf8f8] py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full bg-white shadow-xl rounded-2xl p-8 space-y-8">
        <div>
          <h2 className="text-center text-3xl font-extrabold text-[#1b0e0e]">
            Create your ByteLearn account
          </h2>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-4">
            <input
              type="text"
              name="fullname"
              placeholder="Full Name"
              value={formData.fullname}
              onChange={handleChange}
              className="block w-full px-4 py-3 bg-[#f3e7e8] border-none text-[#1b0e0e] placeholder-[#1b0e0e]/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#994d51]/50 sm:text-sm"
              required
            />
            <input
              type="text"
              name="username"
              placeholder="Username"
              value={formData.username}
              onChange={handleChange}
              className="block w-full px-4 py-3 bg-[#f3e7e8] border-none text-[#1b0e0e] placeholder-[#1b0e0e]/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#994d51]/50 sm:text-sm"
              required
            />
            <input
              type="email"
              name="email"
              placeholder="Email"
              value={formData.email}
              onChange={handleChange}
              className="block w-full px-4 py-3 bg-[#f3e7e8] border-none text-[#1b0e0e] placeholder-[#1b0e0e]/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#994d51]/50 sm:text-sm"
              required
            />
            <input
              type="password"
              name="password"
              placeholder="Password"
              value={formData.password}
              onChange={handleChange}
              className="block w-full px-4 py-3 bg-[#f3e7e8] border-none text-[#1b0e0e] placeholder-[#1b0e0e]/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#994d51]/50 sm:text-sm"
              required
            />
            <select
              name="role"
              value={formData.role}
              onChange={handleChange}
              className="block w-full px-4 py-3 bg-[#f3e7e8] border-none text-[#1b0e0e] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#994d51]/50 sm:text-sm appearance-none"
            >
              <option value="learner">Learner</option>
              <option value="instructor">Instructor</option>
            </select>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Avatar (Required)</label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => handleFileChange(e, "avatar")}
                className="block w-full px-4 py-3 bg-[#f3e7e8] border-none text-[#1b0e0e] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#994d51]/50 sm:text-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-[#994d51] file:text-white hover:file:bg-[#7a3d41]"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Cover Image (Optional)</label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => handleFileChange(e, "coverImage")}
                className="block w-full px-4 py-3 bg-[#f3e7e8] border-none text-[#1b0e0e] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#994d51]/50 sm:text-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-[#994d51] file:text-white hover:file:bg-[#7a3d41]"
              />
            </div>
          </div>

          {error && <div className="text-red-500 text-sm text-center">{error}</div>}

          <button
            type="submit"
            disabled={loading}
            className="w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-lg text-white bg-[#994d51] hover:bg-[#7a3d41] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#994d51] transition-colors disabled:opacity-50"
          >
            {loading ? "Creating account..." : "Create account"}
          </button>

          <div className="text-center">
            <a href="/login" className="font-medium text-[#994d51] hover:text-[#7a3d41] transition-colors">
              Already have an account? Sign in
            </a>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Register;
