import { Link, useLocation } from "react-router-dom";

const NavItem = ({ to, label, icon, active }) => (
  <Link
    to={to}
    className={
      "flex flex-col items-center justify-center border-b-2 px-3 gap-0.5 py-1.5 flex-1 " +
      (active ? "border-b-[#ea2a33] text-[#1b0e0e]" : "border-b-transparent text-[#994d51]")
    }
  >
    <div className={active ? "text-[#1b0e0e]" : "text-[#994d51]"}>
      {icon}
    </div>
    <p className={(active ? "text-[#1b0e0e]" : "text-[#994d51]") + " text-xs font-medium leading-none tracking-[0.01em]"}>{label}</p>
  </Link>
);

const Footer = () => {
  const location = useLocation();
  const path = location.pathname;

  const items = [
    {
      to: "/",
      label: "Home",
      match: (p) => p === "/" || p.startsWith("/videos"),
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 256 256">
          <path d="M224,115.55V208a16,16,0,0,1-16,16H168a16,16,0,0,1-16-16V168a8,8,0,0,0-8-8H112a8,8,0,0,0-8,8v40a16,16,0,0,1-16,16H48a16,16,0,0,1-16-16V115.55a16,16,0,0,1,5.17-11.78l80-75.48.11-.11a16,16,0,0,1,21.53,0,1.14,1.14,0,0,0,.11.11l80,75.48A16,16,0,0,1,224,115.55Z" />
        </svg>
      ),
    },
    {
      to: "/bookmarks",
      label: "Bookmarks",
      match: (p) => p.startsWith("/bookmarks"),
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 256 256">
          <path d="M184,32H72A16,16,0,0,0,56,48V224a8,8,0,0,0,12.24,6.78L128,193.43l59.77,37.35A8,8,0,0,0,200,224V48A16,16,0,0,0,184,32Zm0,177.57-51.77-32.35a8,8,0,0,0-8.48,0L72,209.57V48H184Z" />
        </svg>
      ),
    },
    {
      to: "/subscriptions",
      label: "Subscriptions",
      match: (p) => p.startsWith("/subscriptions"),
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 256 256">
          <path d="M164.44,105.34l-48-32A8,8,0,0,0,104,80v64a8,8,0,0,0,12.44,6.66l48-32a8,8,0,0,0,0-13.32ZM120,129.05V95l25.58,17ZM216,40H40A16,16,0,0,0,24,56V168a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A16,16,0,0,0,216,40Zm0,128H40V56H216V168Zm16,40a8,8,0,0,1-8,8H32a8,8,0,0,1,0-16H224A8,8,0,0,1,232,208Z" />
        </svg>
      ),
    },
    {
      to: "/posts",
      label: "Posts",
      match: (p) => p.startsWith("/posts"),
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 256 256">
          <path d="M117.25,157.92a60,60,0,1,0-66.5,0A95.83,95.83,0,0,0,3.53,195.63a8,8,0,1,0,13.4,8.74,80,80,0,0,1,134.14,0,8,8,0,0,0,13.4-8.74A95.83,95.83,0,0,0,117.25,157.92ZM40,108a44,44,0,1,1,44,44A44.05,44.05,0,0,1,40,108Zm210.14,98.7a8,8,0,0,1-11.07-2.33A79.83,79.83,0,0,0,172,168a8,8,0,0,1,0-16,44,44,0,1,0-16.34-84.87,8,8,0,1,1-5.94-14.85,60,60,0,0,1,55.53,105.64,95.83,95.83,0,0,1,47.22,37.71A8,8,0,0,1,250.14,206.7Z" />
        </svg>
      ),
    },
  ];

  return (
    <footer className="fixed bottom-0 left-0 right-0 z-50 flex justify-center border-t border-[#e7d0d1] bg-[#fcf8f8]/95 backdrop-blur supports-[backdrop-filter]:bg-[#fcf8f8]/80 shadow-[0_-2px_8px_rgba(0,0,0,0.04)]">
      <div className="flex max-w-[960px] w-full flex-col">
        <div className="py-1">
          <div className="flex px-2 justify-between">
            {items.map((it) => (
              <NavItem key={it.to} to={it.to} label={it.label} icon={it.icon} active={it.match(path)} />
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
