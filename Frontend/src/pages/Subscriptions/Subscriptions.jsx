import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import useAuth from "../../hooks/useAuth.js";
import { getSubscribedChannels, toggleSubscription } from "../../api/subscriptions.js";

const ChannelRow = ({ ch, onToggle }) => (
  <div className="flex items-center gap-4 bg-[#fcf8f8] px-4 py-3 justify-between border-b border-[#f3e7e8]">
    <div className="flex items-center gap-3 min-w-0">
      <img src={ch.avatar} alt={ch.username} className="h-10 w-10 rounded-full object-cover" />
      <div className="flex-1 min-w-0">
        <Link to={`/u/${ch.username}`} className="font-medium text-[#1b0e0e] block truncate">{ch.fullname || ch.username}</Link>
        <div className="text-xs text-[#1b0e0e]/70 truncate">@{ch.username}</div>
      </div>
    </div>
    <button
      className="flex min-w-[108px] max-w-[200px] cursor-pointer items-center justify-center overflow-hidden rounded-lg h-8 px-4 bg-[#f3e7e8] text-[#1b0e0e] text-sm font-medium leading-normal w-fit hover:shadow-sm"
      onClick={onToggle}
    >
      Unsubscribe
    </button>
  </div>
);

const Subscriptions = () => {
  const { user } = useAuth();
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  const load = async () => {
    if (!user?._id) return;
    setLoading(true);
    setError("");
    try {
      const res = await getSubscribedChannels(user._id);
      // Backend returns an aggregate array with lookup result under a key. Normalize.
      const raw = Array.isArray(res?.data) ? res.data : res?.data?.subscribedChannels || res?.data || [];
      const extracted = [];
      for (const row of raw) {
        const list = row["Subscribed Channel List:"] || row.SubscribedChannelList || row.Subscribed || row.channels;
        if (Array.isArray(list)) extracted.push(...list);
      }
      const unique = Object.values(
        extracted.reduce((acc, u) => {
          if (!u?._id) return acc;
          acc[u._id] = u;
          return acc;
        }, {})
      );
      setChannels(unique);
    } catch (e) {
      setError(typeof e === "string" ? e : e?.message || "Failed to load subscriptions");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?._id]);

  const onToggle = async (channelId) => {
    try {
      await toggleSubscription(channelId);
      setChannels((prev) => prev.filter((c) => c._id !== channelId));
    } catch (_) {}
  };

  return (
    <div className="max-w-5xl mx-auto">
      <div className="p-4">
        <div className="flex flex-wrap justify-between gap-3">
          <p className="text-[#1b0e0e] tracking-light text-[32px] font-bold leading-tight">Subscriptions</p>
        </div>

        {/* Search input */}
        <div className="px-1 pt-2 pb-3">
          <label className="flex flex-col min-w-40 h-12 w-full">
            <div className="flex w-full flex-1 items-stretch rounded-lg h-full">
              <div className="text-[#994d51] flex border-none bg-[#f3e7e8] items-center justify-center pl-4 rounded-l-lg border-r-0">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 256 256">
                  <path d="M229.66,218.34l-50.07-50.06a88.11,88.11,0,1,0-11.31,11.31l50.06,50.07a8,8,0,0,0,11.32-11.32ZM40,112a72,72,0,1,1,72,72A72.08,72.08,0,0,1,40,112Z"></path>
                </svg>
              </div>
              <input
                placeholder="Search"
                className="form-input flex w-full min-w-0 flex-1 resize-none overflow-hidden rounded-lg text-[#1b0e0e] focus:outline-0 focus:ring-0 border-none bg-[#f3e7e8] focus:border-none h-full placeholder:text-[#994d51] px-4 rounded-l-none border-l-0 pl-2 text-base font-normal leading-normal"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          </label>
        </div>

        {loading && <div className="text-[#1b0e0e]/70">Loading...</div>}
        {error && <div className="text-red-600">{error}</div>}

        {!loading && !error && channels.length === 0 && (
          <div className="text-[#1b0e0e]/70">You are not subscribed to any channels.</div>
        )}

        {/* Derived filtered list */}
        {(() => {
          const q = query.trim().toLowerCase();
          const filtered = q
            ? channels.filter((c) =>
                [c.fullname, c.username]
                  .filter(Boolean)
                  .some((v) => String(v).toLowerCase().includes(q))
              )
            : channels;

          if (!loading && !error && filtered.length > 0) {
            return (
              <>
                {/* Horizontal scroll strip */}
                <div className="flex overflow-y-hidden overflow-x-auto gap-4 [-ms-scrollbar-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden py-2">
                  {filtered.map((ch) => (
                    <Link key={`strip-${ch._id}`} to={`/u/${ch.username}`} className="flex h-full flex-col gap-2 rounded-lg min-w-40">
                      <div className="w-full bg-center bg-no-repeat aspect-video bg-cover rounded-lg" style={{ backgroundImage: `url(${ch.banner || ch.avatar})` }} />
                      <p className="text-[#1b0e0e] text-sm font-medium leading-normal truncate">{ch.fullname || ch.username}</p>
                    </Link>
                  ))}
                </div>

                {/* Rows list */}
                <div className="flex flex-col mt-2">
                  {filtered.map((ch) => (
                    <ChannelRow key={ch._id} ch={ch} onToggle={() => onToggle(ch._id)} />
                  ))}
                </div>
              </>
            );
          }
          return null;
        })()}
      </div>
    </div>
  );
};

export default Subscriptions;
