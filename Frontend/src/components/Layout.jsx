import { Outlet, Link, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import useAuth from "../hooks/useAuth.js";
import ToastHost from "./ToastHost.jsx";
import Footer from "./Footer.jsx";

const Layout = () => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const hideFooter = location.pathname.startsWith("/videos/");
  const [avatarOpen, setAvatarOpen] = useState(false);
  const avatarRef = useRef(null);
  const [searchQuery, setSearchQuery] = useState("");

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  useEffect(() => {
    const onDocClick = (e) => {
      if (!avatarRef.current) return;
      if (!avatarRef.current.contains(e.target)) {
        setAvatarOpen(false);
      }
    };
    const onEsc = (e) => {
      if (e.key === "Escape") setAvatarOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#fcf8f8]">
      <ToastHost />
      {/* Header with subtle glass effect */}
      <nav className="relative z-50 bg-white/60 backdrop-blur-md border-b border-white/30">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex items-center justify-between h-16">
            {/* Left: Brand + Nav */}
            <div className="flex items-center gap-8">
              <Link to="/" className="flex items-center gap-3 text-[#1b0e0e]">
                <span className="size-4 text-[#1b0e0e]">
                  <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path fillRule="evenodd" clipRule="evenodd" d="M24 4H42V17.3333V30.6667H24V44H6V30.6667V17.3333H24V4Z" fill="currentColor"></path>
                  </svg>
                </span>
                <h2 className="text-[#1b0e0e] text-lg font-bold leading-tight tracking-[-0.015em]">ByteLearn</h2>
              </Link>
              <div className="hidden md:flex items-center gap-9">
                <Link to="/" className="text-[#1b0e0e] text-sm font-medium leading-normal">Home</Link>
                <Link to="/bookmarks" className="text-[#1b0e0e] text-sm font-medium leading-normal">Bookmarks</Link>
                <Link to="/subscriptions" className="text-[#1b0e0e] text-sm font-medium leading-normal">Subscriptions</Link>
                <Link to="/continue" className="text-[#1b0e0e] text-sm font-medium leading-normal">Continue</Link>
              </div>
            </div>

            {/* Right: Search + Buttons + Auth */}
            <div className="flex items-center gap-6">
              {/* Search (non-functional UI) */}
              <form
                className="hidden sm:flex flex-col min-w-40 !h-10 max-w-64"
                onSubmit={(e) => {
                  e.preventDefault();
                  const q = searchQuery.trim();
                  if (q.length === 0) return;
                  navigate(`/search?q=${encodeURIComponent(q)}`);
                }}
              >
                <div className="flex w-full flex-1 items-stretch rounded-lg h-full">
                  <div className="text-[#994d51] flex border-none bg-[#f3e7e8] items-center justify-center pl-4 rounded-l-lg border-r-0">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 256 256">
                      <path d="M229.66,218.34l-50.07-50.06a88.11,88.11,0,1,0-11.31,11.31l50.06,50.07a8,8,0,0,0,11.32-11.32ZM40,112a72,72,0,1,1,72,72A72.08,72.08,0,0,1,40,112Z"></path>
                    </svg>
                  </div>
                  <input
                    placeholder="Search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="form-input flex w-full min-w-0 flex-1 resize-none overflow-hidden rounded-lg text-[#1b0e0e] focus:outline-0 focus:ring-0 border-none bg-[#f3e7e8] focus:border-none h-full placeholder:text-[#994d51] px-4 rounded-l-none border-l-0 pl-2 text-base font-normal leading-normal"
                  />
                </div>
              </form>
              {/* Upload button for instructors on home page only */}
              {user && user.role === 'instructor' && location.pathname === '/' && (
                <Link
                  to="/videos/upload"
                  className="hidden sm:inline-flex items-center gap-2 bg-[#1b0e0e] text-white px-4 py-2 rounded-lg text-sm font-bold hover:opacity-90"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 3l4 4h-3v6h-2V7H8l4-4zm-7 14h14v2H5v-2z" />
                  </svg>
                  Upload
                </Link>
              )}

              {/* Auth controls */}
              <div className="flex items-center gap-4 relative" ref={avatarRef}>
                {user ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setAvatarOpen((v) => !v)}
                      className="flex items-center gap-2 focus:outline-none"
                      aria-haspopup="menu"
                      aria-expanded={avatarOpen}
                    >
                      {user.avatar ? (
                        <img src={user.avatar} alt={user.fullname} className="h-9 w-9 rounded-full object-cover ring-1 ring-[#e7d0d1]" />
                      ) : (
                        <div className="h-9 w-9 rounded-full bg-[#f3e7e8] text-[#1b0e0e] flex items-center justify-center text-xs font-bold">
                          {user.fullname?.[0]?.toUpperCase() || "U"}
                        </div>
                      )}
                      <span className="hidden sm:inline text-sm text-[#1b0e0e]">{user.fullname}</span>
                      <svg className="hidden sm:block text-[#994d51]" xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 256 256">
                        <path d="M128,168a8,8,0,0,1-5.66-2.34l-48-48a8,8,0,0,1,11.32-11.32L128,148.69l42.34-42.35a8,8,0,0,1,11.32,11.32l-48,48A8,8,0,0,1,128,168Z" />
                      </svg>
                    </button>

                    {avatarOpen && (
                      <div
                        role="menu"
                        className="absolute right-0 top-[52px] z-50 w-56 rounded-lg border border-white/20 bg-white/70 backdrop-blur-lg shadow-xl"
                      >
                        <div className="px-3 py-2 border-b border-[#e7d0d1]">
                          <p className="text-xs text-[#994d51]">Signed in as</p>
                          <p className="text-sm font-medium text-[#1b0e0e] truncate">{user.fullname}</p>
                        </div>
                        <div className="py-1">
                          <Link to={user?.role === 'instructor' ? '/dashboard' : '/learner/dashboard'} className="flex items-center gap-3 px-3 py-2.5 text-sm text-[#1b0e0e] hover:bg-[#f3e7e8]" role="menuitem" onClick={() => setAvatarOpen(false)}>
                            <span className="text-[#994d51]"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 256 256"><path d="M216,40H40A16,16,0,0,0,24,56V200a16,16,0,0,0,16,16h80V160H104a8,8,0,0,1,0-16h48a8,8,0,0,1,0,16H120v56h96a16,16,0,0,0,16-16V56A16,16,0,0,0,216,40Z"/></svg></span>
                            Dashboard
                          </Link>
                          <Link to="/profile" className="flex items-center gap-3 px-3 py-2.5 text-sm text-[#1b0e0e] hover:bg-[#f3e7e8]" role="menuitem" onClick={() => setAvatarOpen(false)}>
                            <span className="text-[#994d51]"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 256 256"><path d="M117.25,157.92a60,60,0,1,0-66.5,0A95.83,95.83,0,0,0,3.53,195.63a8,8,0,1,0,13.4,8.74,80,80,0,0,1,134.14,0,8,8,0,0,0,13.4-8.74A95.83,95.83,0,0,0,117.25,157.92ZM40,108a44,44,0,1,1,44,44A44.05,44.05,0,0,1,40,108Z"/></svg></span>
                            Profile
                          </Link>
                          {user.role === 'instructor' && (
                            <Link to={user.username ? `/u/${user.username}` : "/profile"} className="flex items-center gap-3 px-3 py-2.5 text-sm text-[#1b0e0e] hover:bg-[#f3e7e8]" role="menuitem" onClick={() => setAvatarOpen(false)}>
                              <span className="text-[#994d51]"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 256 256"><path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm0,192a88,88,0,1,1,88-88A88.1,88.1,0,0,1,128,216Zm0-160a72,72,0,0,0-72,72,8,8,0,0,0,16,0,56,56,0,1,1,56,56,8,8,0,0,0,0,16,72,72,0,0,0,0-144Z"/></svg></span>
                              View public profile
                            </Link>
                          )}
                          {/* Continue link removed per request */}
                        </div>
                        <div className="py-1 border-t border-[#e7d0d1]">
                          <button onClick={handleLogout} className="w-full text-left flex items-center gap-3 px-3 py-2.5 text-sm text-[#1b0e0e] hover:bg-[#f3e7e8]" role="menuitem">
                            <span className="text-[#994d51]"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 256 256"><path d="M174.63,133.66a8,8,0,0,0,0-11.32l-32-32a8,8,0,0,0-11.32,11.32L148.69,120H96a8,8,0,0,0,0,16h52.69l-17.38,18.34a8,8,0,1,0,11.38,11.24Z"/><path d="M216,40H120a16,16,0,0,0-16,16V88a8,8,0,0,0,16,0V56h96V200H120V168a8,8,0,0,0-16,0v32a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A16,16,0,0,0,216,40Z"/></svg></span>
                            Logout
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <Link to="/login" className="text-[#1b0e0e] px-3 py-2 text-sm font-medium rounded-lg hover:bg-[#f3e7e8]">
                      Sign in
                    </Link>
                    <Link to="/register" className="bg-[#1b0e0e] text-white px-4 py-2 rounded-lg text-sm font-bold hover:opacity-90">
                      Sign up
                    </Link>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </nav>

      {/* Main content */}
      <main className={`max-w-7xl mx-auto py-6 px-6 ${!hideFooter ? 'pb-20' : ''}`}>
        <Outlet />
      </main>
      {!hideFooter && <Footer />}
    </div>
  );
};

export default Layout;
