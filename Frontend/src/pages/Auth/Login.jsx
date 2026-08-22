import { useState } from "react";
import { useNavigate } from "react-router-dom";
import useAuth from "../../hooks/useAuth.js";

const Login = () => {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [formData, setFormData] = useState({ 
    email: "", 
    username: "", 
    password: "" 
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      // Send either email or username (backend accepts both)
      const credentials = {
        email: formData.email || formData.username,
        username: formData.username || formData.email,
        password: formData.password
      };

      const res = await login(credentials);
      const role = res?.data?.role || res?.data?.user?.role || res?.data?.profile?.role;
      if (role === "INSTRUCTOR") {
        navigate("/profile");
      } else {
        navigate("/learner/dashboard");
      }
    } catch (err) {
      setError(err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#fcf8f8] py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full bg-white shadow-xl rounded-2xl p-8 space-y-8">
        <div>
          <h2 className="text-center text-3xl font-extrabold text-[#1b0e0e]">
            Sign in to ByteLearn
          </h2>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <input
                type="text"
                name="email"
                placeholder="Email or Username"
                value={formData.email}
                onChange={handleChange}
                className="block w-full px-4 py-3 bg-[#f3e7e8] border-none text-[#1b0e0e] placeholder-[#1b0e0e]/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#994d51]/50 sm:text-sm"
                required
              />
            </div>
            <div>
              <input
                type="password"
                name="password"
                placeholder="Password"
                value={formData.password}
                onChange={handleChange}
                className="block w-full px-4 py-3 bg-[#f3e7e8] border-none text-[#1b0e0e] placeholder-[#1b0e0e]/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#994d51]/50 sm:text-sm"
                required
              />
            </div>
          </div>

          {error && (
            <div className="text-red-500 text-sm text-center">{error}</div>
          )}

          <div>
            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-lg text-white bg-[#994d51] hover:bg-[#7a3d41] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#994d51] transition-colors disabled:opacity-50"
            >
              {loading ? "Signing in..." : "Sign in"}
            </button>
          </div>

          <div className="text-center">
            <a
              href="/register"
              className="font-medium text-[#994d51] hover:text-[#7a3d41] transition-colors"
            >
              Don't have an account? Sign up
            </a>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Login;
