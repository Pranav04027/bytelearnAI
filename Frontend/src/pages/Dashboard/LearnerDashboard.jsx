import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getLearnerDashboard, getWatchHistory as getUserWatchHistory } from "../../api/auth.js";
import { getContinueWatching, getProgressHistory } from "../../api/progress.js";
import { getRecommendedVideos } from "../../api/recommendations.js";
import { getMyBookmarks } from "../../api/bookmarks.js";

const LearnerDashboard = () => {
  const [data, setData] = useState(null);
  const [history, setHistory] = useState([]);
  const [recommended, setRecommended] = useState([]);
  const [progressEntries, setProgressEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const [dash, cont, hist, rec, bms, prog] = await Promise.all([
          getLearnerDashboard().catch(() => null),
          getContinueWatching().catch(() => null),
          getUserWatchHistory().catch(() => null),
          getRecommendedVideos().catch(() => null),
          getMyBookmarks().catch(() => null),
          getProgressHistory().catch(() => null),
        ]);

        const dashData = dash?.data || dash;
        const progList = Array.isArray(prog?.data) ? prog.data : (Array.isArray(prog) ? prog : []);
        setProgressEntries(progList);

        setData({
          continueWatching: cont?.data || cont || dashData?.resumeVideos || [],
          bookmarks: bms?.data || bms || dashData?.bookmarks || [],
          likes: dashData?.likes || [],
          quizAttempts: dashData?.quizAttempts || [],
          watchedCount: Array.isArray((dashData?.watchHistory)) ? dashData.watchHistory.length : undefined,
          bookmarksCount: Array.isArray((bms?.data || bms)) ? (bms?.data || bms).length : undefined,
          likesCount: Array.isArray(dashData?.likes) ? dashData.likes.length : undefined,
        });

        const histList = Array.isArray(hist?.data?.listOfWatchedVideos)
          ? hist?.data?.listOfWatchedVideos
          : Array.isArray(hist?.data)
          ? hist?.data
          : Array.isArray(hist?.history)
          ? hist?.history
          : [];
        setHistory(histList);

        const recList = Array.isArray(rec?.data) ? rec.data : (rec?.videos || rec?.data?.videos || []);
        setRecommended(recList);
      } catch (e) {
        setError(typeof e === 'string' ? e : e?.message || 'Failed to load learner dashboard');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const progressByVideo = useMemo(() => {
    const map = new Map();
    for (const p of progressEntries) {
      const vid = p?.video?._id || p?.videoId || p?.video;
      const perc = Number(p?.progress) || 0;
      if (vid) map.set(String(vid), Math.max(0, Math.min(100, perc)));
    }
    return map;
  }, [progressEntries]);

  // Normalize a quiz attempt into a percentage and a display value
  const normalizeAttempt = (a) => {
    // 0) Prefer explicit totalPercentage if provided by backend
    const tp = Number(a?.totalPercentage ?? a?.percentage ?? a?.percent);
    if (Number.isFinite(tp)) {
      const pct = Math.max(0, Math.min(100, Math.round(tp)));
      return { percent: pct, display: `${pct}%` };
    }

    // 1) Support fraction strings like "7/10"
    // Prefer correctAnswers/totalQuestions over score/total when both exist
    const scoreRaw = (a?.correctAnswers ?? a?.correct ?? a?.score);
    const totalRaw = (a?.totalQuestions ?? a?.total);
    if (typeof scoreRaw === 'string' && scoreRaw.includes('/')) {
      const parts = scoreRaw.split('/')
        .map((s) => Number(String(s).trim()))
        .filter((n) => Number.isFinite(n));
      if (parts.length === 2 && parts[1] > 0) {
        const [s, t] = parts;
        // If denominator looks like percent-scale (>=100), interpret as percent instead of question count
        if (t >= 100) {
          const pct = Math.max(0, Math.min(100, Math.round(s)));
          return { percent: pct, display: `${pct}%` };
        }
        const pct = Math.max(0, Math.min(100, Math.round((s / t) * 100)));
        return { percent: pct, display: `${s}/${t}` };
      }
    }

    // 2) Numeric score/total variants
    const sNum = Number(scoreRaw);
    const tNum = Number(totalRaw);
    // Only treat as question-count fraction when total is reasonably small
    if (Number.isFinite(sNum) && Number.isFinite(tNum) && tNum > 0 && tNum <= 50) {
      // Treat as questions-correct model
      const pct = Math.max(0, Math.min(100, Math.round((sNum / tNum) * 100)));
      return { percent: pct, display: `${sNum}/${tNum}` };
    }

    // 3) Score as 0..1 decimal
    if (Number.isFinite(sNum) && sNum > 0 && sNum <= 1 && (!Number.isFinite(tNum) || tNum <= 1)) {
      const pct = Math.max(0, Math.min(100, Math.round(sNum * 100)));
      return { percent: pct, display: `${pct}%` };
    }

    // 4) Percent-scale cases
    if (Number.isFinite(sNum) && (!Number.isFinite(tNum) || tNum >= 100)) {
      // Heuristic: if score is binary 0 or 1, and total indicates percent-scale,
      // interpret this as 0/1 or 1/1 (single-question quiz) => 0% or 100%.
      if (sNum === 0 || sNum === 1) {
        const pct = sNum * 100;
        return { percent: pct, display: `${sNum}/1` };
      }
      const pct = Math.max(0, Math.min(100, Math.round(sNum)));
      return { percent: pct, display: `${pct}%` };
    }

    // Fallback
    return { percent: undefined, display: '-' };
  };

  const avgQuizScore = useMemo(() => {
    const attempts = Array.isArray(data?.quizAttempts) ? data.quizAttempts : [];
    if (attempts.length === 0) return undefined;
    // Group by video/quiz and pick latest attempt per quiz
    const byQuiz = new Map();
    for (const a of attempts) {
      const quizId = a?.video?._id || a?.videoId || a?.quizId || a?._id;
      if (!quizId) continue;
      const ts = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
      const prev = byQuiz.get(String(quizId));
      if (!prev || ts >= (prev.ts || 0)) {
        byQuiz.set(String(quizId), { a, ts });
      }
    }
    const latest = Array.from(byQuiz.values()).map((x) => x.a);
    const percents = latest
      .map((a) => normalizeAttempt(a).percent)
      .filter((v) => typeof v === 'number' && Number.isFinite(v));
    if (!percents.length) return undefined;
    return Math.round(percents.reduce((acc, v) => acc + v, 0) / percents.length);
  }, [data?.quizAttempts]);

  return (
    <div className="px-40 max-[1100px]:px-6 flex justify-center py-5">
      <div className="flex flex-col max-w-[960px] flex-1">
        <div className="flex flex-wrap justify-between gap-3 p-4">
          <p className="text-[#0d0f1c] tracking-light text-[32px] font-bold leading-tight min-w-72">My Learning Dashboard</p>
        </div>

        {loading && <div className="bg-white shadow rounded p-6 text-gray-600">Loading...</div>}
        {error && <div className="bg-white shadow rounded p-6 text-red-600">{error}</div>}

        {!loading && !error && (
          <>
            {/* Stats */}
            <div className="flex flex-wrap gap-4 p-4">
              <div className="flex min-w-[158px] flex-1 flex-col gap-2 rounded-lg p-6 border border-[#ced2e9]">
                <p className="text-[#0d0f1c] text-base font-medium leading-normal">Videos Completed</p>
                <p className="text-[#0d0f1c] tracking-light text-2xl font-bold leading-tight">{data?.watchedCount ?? '-'}</p>
              </div>
              <div className="flex min-w-[158px] flex-1 flex-col gap-2 rounded-lg p-6 border border-[#ced2e9]">
                <p className="text-[#0d0f1c] text-base font-medium leading-normal">Quizzes Attempted</p>
                <p className="text-[#0d0f1c] tracking-light text-2xl font-bold leading-tight">{Array.isArray(data?.quizAttempts) ? data.quizAttempts.length : '-'}</p>
              </div>
              <div className="flex min-w-[158px] flex-1 flex-col gap-2 rounded-lg p-6 border border-[#ced2e9]">
                <p className="text-[#0d0f1c] text-base font-medium leading-normal">Average Quiz Score</p>
                <p className="text-[#0d0f1c] tracking-light text-2xl font-bold leading-tight">{typeof avgQuizScore === 'number' ? `${avgQuizScore}%` : '-'}</p>
              </div>
              <div className="flex min-w-[158px] flex-1 flex-col gap-2 rounded-lg p-6 border border-[#ced2e9]">
                <p className="text-[#0d0f1c] text-base font-medium leading-normal">Total Learning Time</p>
                <p className="text-[#0d0f1c] tracking-light text-2xl font-bold leading-tight">-</p>
              </div>
            </div>

            {/* Recently Watched */}
            <h2 className="text-[#0d0f1c] text-[22px] font-bold leading-tight tracking-[-0.015em] px-4 pb-3 pt-5">Recently Watched</h2>
            <div className="px-4 py-3 @container">
              <div className="flex overflow-hidden rounded-lg border border-[#ced2e9] bg-[#f8f9fc]">
                <table className="flex-1">
                  <thead>
                    <tr className="bg-[#f8f9fc]">
                      <th className="table-learner-col-120 px-4 py-3 text-left text-[#0d0f1c] w-[400px] text-sm font-medium leading-normal">Video Title</th>
                      <th className="table-learner-col-240 px-4 py-3 text-left text-[#0d0f1c] w-[400px] text-sm font-medium leading-normal">Course</th>
                      <th className="table-learner-col-360 px-4 py-3 text-left text-[#0d0f1c] w-[400px] text-sm font-medium leading-normal">Progress</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(history || []).slice(0, 3).map((v) => {
                      const vid = v?._id || v?.videoId || v?.video?._id;
                      const progress = progressByVideo.get(String(vid)) || 0;
                      return (
                        <tr key={vid} className="border-t border-t-[#ced2e9]">
                          <td className="table-learner-col-120 h-[72px] px-4 py-2 w-[400px] text-[#0d0f1c] text-sm font-normal leading-normal">{v?.title || '-'}</td>
                          <td className="table-learner-col-240 h-[72px] px-4 py-2 w-[400px] text-[#47569e] text-sm font-normal leading-normal">{v?.courseTitle || v?.playlistTitle || '-'}</td>
                          <td className="table-learner-col-360 h-[72px] px-4 py-2 w-[400px] text-sm font-normal leading-normal">
                            <div className="flex items-center gap-3">
                              <div className="w-[88px] overflow-hidden rounded-sm bg-[#ced2e9]"><div className="h-1 rounded-full bg-[#607afb]" style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}></div></div>
                              <p className="text-[#0d0f1c] text-sm font-medium leading-normal">{Math.round(progress)}</p>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {history.length === 0 && (
                      <tr className="border-t border-t-[#ced2e9]"><td className="px-4 py-3 text-sm text-[#47569e]" colSpan={3}>No watch history.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <style>{`@container(max-width:120px){.table-learner-col-120{display:none;}}
@container(max-width:240px){.table-learner-col-240{display:none;}}
@container(max-width:360px){.table-learner-col-360{display:none;}}`}</style>
            </div>

            {/* Quiz History */}
            <h2 className="text-[#0d0f1c] text-[22px] font-bold leading-tight tracking-[-0.015em] px-4 pb-3 pt-5">Quiz History</h2>
            <div className="px-4 py-3 @container">
              <div className="flex overflow-hidden rounded-lg border border-[#ced2e9] bg-[#f8f9fc]">
                <table className="flex-1">
                  <thead>
                    <tr className="bg-[#f8f9fc]">
                      <th className="table-quiz-col-120 px-4 py-3 text-left text-[#0d0f1c] w-[400px] text-sm font-medium leading-normal">Video Title</th>
                      <th className="table-quiz-col-240 px-4 py-3 text-left text-[#0d0f1c] w-[400px] text-sm font-medium leading-normal">Video Difficulty</th>
                      <th className="table-quiz-col-360 px-4 py-3 text-left text-[#0d0f1c] w-[400px] text-sm font-medium leading-normal">Score</th>
                      <th className="table-quiz-col-480 px-4 py-3 text-left text-[#0d0f1c] w-[400px] text-sm font-medium leading-normal">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.isArray(data?.quizAttempts) && data.quizAttempts.length > 0 ? (
                      data.quizAttempts.slice(0, 3).map((a) => (
                        <tr key={a._id} className="border-t border-t-[#ced2e9]">
                          <td className="table-quiz-col-120 h-[72px] px-4 py-2 w-[400px] text-[#0d0f1c] text-sm font-normal leading-normal">{a?.video?.title || a?.videoTitle || '-'}</td>
                          <td className="table-quiz-col-240 h-[72px] px-4 py-2 w-[400px] text-[#47569e] text-sm font-normal leading-normal">{a?.video?.difficulty || a?.videoDifficulty || '-'}</td>
                          <td className="table-quiz-col-360 h-[72px] px-4 py-2 w-[400px] text-[#47569e] text-sm font-normal leading-normal">{(() => { const n = normalizeAttempt(a); const extra = (n.display || '').includes('/') ? ` (${n.display})` : ''; return typeof n.percent === 'number' ? `${n.percent}%${extra}` : (n.display || '-'); })()}</td>
                          <td className="table-quiz-col-480 h-[72px] px-4 py-2 w-[400px] text-[#47569e] text-sm font-normal leading-normal">{a?.createdAt ? new Date(a.createdAt).toLocaleDateString() : '-'}</td>
                        </tr>
                      ))
                    ) : (
                      <tr className="border-t border-t-[#ced2e9]"><td className="px-4 py-3 text-sm text-[#47569e]" colSpan={4}>No quiz attempts.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <style>{`@container(max-width:120px){.table-quiz-col-120{display:none;}}
@container(max-width:240px){.table-quiz-col-240{display:none;}}
@container(max-width:360px){.table-quiz-col-360{display:none;}}
@container(max-width:480px){.table-quiz-col-480{display:none;}}`}</style>
          </div>

          {/* Recommendations */}
          <h2 className="text-[#0d0f1c] text-[22px] font-bold leading-tight tracking-[-0.015em] px-4 pb-3 pt-5">Recommendations</h2>
          <div className="flex overflow-y-auto [-ms-scrollbar-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="flex items-stretch p-4 gap-3">
              {(recommended || []).slice(0, 9).map((v) => (
                <Link key={v._id} to={`/videos/${v._id}`} className="flex h-full flex-1 flex-col gap-4 rounded-lg min-w-40">
                  <div className="w-full bg-center bg-no-repeat aspect-video bg-cover rounded-lg flex flex-col" style={{ backgroundImage: `url(${(v.thumbnail || '').replace('http://','https://')})` }} />
                  <div>
                    <p className="text-[#0d0f1c] text-base font-medium leading-normal line-clamp-2">{v.title}</p>
                    <p className="text-[#47569e] text-sm font-normal leading-normal line-clamp-2">{v.description}</p>
                  </div>
                </Link>
              ))}
              {recommended.length === 0 && (
                <div className="text-sm text-[#47569e] px-4">No recommendations yet.</div>
              )}
            </div>
          </div>

          {/* Attempts Log */}
          <h2 className="text-[#0d0f1c] text-[22px] font-bold leading-tight tracking-[-0.015em] px-4 pb-3 pt-5">Attempts Log</h2>
          <div className="px-4 py-3 @container">
            <div className="flex overflow-hidden rounded-lg border border-[#ced2e9] bg-[#f8f9fc]">
              <table className="flex-1">
                <thead>
                  <tr className="bg-[#f8f9fc]">
                    <th className="px-4 py-3 text-left text-[#0d0f1c] text-sm font-medium leading-normal">Quiz</th>
                    <th className="px-4 py-3 text-left text-[#0d0f1c] text-sm font-medium leading-normal">Attempt</th>
                    <th className="px-4 py-3 text-left text-[#0d0f1c] text-sm font-medium leading-normal">Score</th>
                    <th className="px-4 py-3 text-left text-[#0d0f1c] text-sm font-medium leading-normal">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.isArray(data?.quizAttempts) && data.quizAttempts.length > 0 ? (
                    (() => {
                      // Sort by date asc to count attempt numbers per quiz
                      const sorted = [...data.quizAttempts].sort((a,b)=> new Date(a?.createdAt||0) - new Date(b?.createdAt||0));
                      const countByQuiz = new Map();
                      return sorted.slice(-10).map((a, idx) => {
                        const qid = a?.video?._id || a?.videoId || a?.quizId || idx;
                        const prev = countByQuiz.get(String(qid)) || 0;
                        const attemptNo = prev + 1;
                        countByQuiz.set(String(qid), attemptNo);
                        const label = attemptNo === 1 ? 'Attempt' : 'Re-attempt';
                        const norm = normalizeAttempt(a);
                        return (
                          <tr key={`${qid}-${a?._id || idx}`} className="border-t border-t-[#ced2e9]">
                            <td className="h-[56px] px-4 py-2 text-[#0d0f1c] text-sm">{a?.video?.title || a?.videoTitle || '-'}</td>
                            <td className="h-[56px] px-4 py-2 text-[#47569e] text-sm">{label} {attemptNo > 2 ? `#${attemptNo}` : ''}</td>
                            <td className="h-[56px] px-4 py-2 text-[#47569e] text-sm">{(() => { const extra = (norm.display || '').includes('/') ? ` (${norm.display})` : ''; return typeof norm.percent === 'number' ? `${norm.percent}%${extra}` : (norm.display || '-'); })()}</td>
                            <td className="h-[56px] px-4 py-2 text-[#47569e] text-sm">{a?.createdAt ? new Date(a.createdAt).toLocaleString() : '-'}</td>
                          </tr>
                        );
                      });
                    })()
                  ) : (
                    <tr className="border-t border-t-[#ced2e9]"><td className="px-4 py-3 text-sm text-[#47569e]" colSpan={4}>No attempts yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  </div>
);
};

export default LearnerDashboard;
