import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { getQuizByVideoId, submitQuiz } from "../../api/quizzes.js";
import { getLearnerDashboard } from "../../api/auth.js";

const TakeQuiz = () => {
  const { videoId } = useParams();
  const [quiz, setQuiz] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [answers, setAnswers] = useState({}); // questionId -> optionId
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [attemptsForThisQuiz, setAttemptsForThisQuiz] = useState([]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      setResult(null);
      try {
        const res = await getQuizByVideoId(videoId);
        const data = res?.data || res?.quiz || res || null;
        setQuiz(data);
        // Load learner attempts to calculate current attempt count for this quiz
        try {
          const dash = await getLearnerDashboard();
          const attempts = Array.isArray(dash?.data?.quizAttempts)
            ? dash.data.quizAttempts
            : Array.isArray(dash?.quizAttempts)
            ? dash.quizAttempts
            : [];
          const filtered = attempts.filter(
            (a) => (a?.video?._id || a?.videoId) === videoId
          );
          // sort by date asc
          filtered.sort((a,b)=> new Date(a?.createdAt||0) - new Date(b?.createdAt||0));
          setAttemptsForThisQuiz(filtered);
        } catch (_) {
          // ignore if dashboard fetch fails
          setAttemptsForThisQuiz([]);
        }
      } catch (e) {
        setError(typeof e === "string" ? e : e?.message || "Failed to load quiz");
      } finally {
        setLoading(false);
      }
    };
    if (videoId) load();
  }, [videoId]);

  const onSelect = (qid, oid) => {
    setAnswers((prev) => ({ ...prev, [qid]: oid }));
  };

  const onSubmit = async () => {
    if (!quiz) return;
    if (attemptsForThisQuiz.length >= 2) {
      setError("Attempt limit reached (2). You cannot submit again.");
      return;
    }
    // Require answers for all questions to avoid backend errors on null IDs
    const questions = Array.isArray(quiz?.questions) ? quiz.questions : [];
    const unanswered = questions.filter((q) => !answers[q?._id || q?.id]);
    if (unanswered.length > 0) {
      setError(`Please answer all questions before submitting. Unanswered: ${unanswered.length}`);
      return;
    }
    const payload = {
      answers: (quiz?.questions || []).map((q) => ({
        // Backend expects 'question' and 'selectedOption'
        question: q?._id || q?.id,
        selectedOption: answers[q?._id || q?.id] || null,
      })),
    };
    setSubmitting(true);
    setResult(null);
    try {
      const res = await submitQuiz(videoId, payload);
      setResult(res?.data || res);
      // Update attempts locally to reflect the new submission
      setAttemptsForThisQuiz((prev)=>[...prev, { createdAt: new Date().toISOString() }]);
    } catch (e) {
      setError(typeof e === "string" ? e : e?.message || "Failed to submit quiz");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="max-w-3xl mx-auto bg-white shadow rounded-lg p-6 text-center text-gray-600">Loading quiz...</div>;
  }

  if (!quiz) {
    return (
      <div className="max-w-3xl mx-auto bg-white shadow rounded-lg p-6 text-center">
        <p className="text-gray-600">No quiz exists for this video.</p>
        <Link to={`/videos/${videoId}`} className="text-indigo-600 hover:text-indigo-700 inline-block mt-4">Back to Video</Link>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-3xl mx-auto bg-white shadow rounded-lg p-6 text-center">
        <p className="text-red-600">{error}</p>
        <Link to={`/videos/${videoId}`} className="text-indigo-600 hover:text-indigo-700 inline-block mt-4">Back to Video</Link>
      </div>
    );
  }

  const questions = Array.isArray(quiz?.questions) ? quiz.questions : [];
  const attemptCount = (attemptsForThisQuiz?.length || 0);
  const attemptNo = attemptCount + 1;
  const isReattempt = attemptNo === 2;
  const attemptLimitReached = attemptCount >= 2;

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="bg-white shadow rounded-lg p-4">
        <h1 className="text-xl font-semibold text-gray-900">Quiz</h1>
        <div className="mt-1 text-sm text-gray-600">
          {attemptLimitReached ? (
            <span>Attempt limit reached (2/2).</span>
          ) : (
            <span>
              {isReattempt ? "Re-attempt" : "Attempt"} {attemptNo} of 2
            </span>
          )}
        </div>
      </div>

      <div className="bg-white shadow rounded-lg p-4 space-y-6">
        {questions.length === 0 ? (
          <div className="text-gray-700">No questions available.</div>
        ) : (
          questions.map((q, idx) => {
            const qid = q?._id || q?.id || String(idx);
            const opts = Array.isArray(q?.options) ? q.options : [];
            return (
              <div key={qid} className="space-y-2">
                <div className="font-medium text-gray-900">{idx + 1}. {q?.questionText || q?.question || q?.text || "Question"}</div>
                <div className="space-y-2">
                  {opts.map((o, oi) => {
                    const oid = o?._id || o?.id || `${qid}-${oi}`;
                    return (
                      <label key={oid} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name={`q-${qid}`}
                          checked={answers[qid] === oid}
                          onChange={() => onSelect(qid, oid)}
                        />
                        <span className="text-gray-800">{o?.text || o?.label || String(o)}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
        <div className="pt-2">
          <button onClick={onSubmit} disabled={submitting || attemptLimitReached} className="px-4 py-2 bg-indigo-600 text-white rounded disabled:opacity-50">
            {attemptLimitReached ? "Attempt limit reached" : (submitting ? "Submitting..." : (isReattempt ? "Submit Re-attempt" : "Submit Quiz"))}
          </button>
        </div>
        {result && (
          (() => {
            const totalQuestions = result?.totalQuestions ?? (result?.total || 0);
            const correct = result?.correctAnswers ?? result?.score ?? 0;
            const percentage = typeof result?.totalPercentage === "number"
              ? Math.round(result.totalPercentage)
              : (totalQuestions ? Math.round((correct / totalQuestions) * 100) : 0);
            return (
              <div className="mt-6 p-6 rounded-lg border bg-white shadow">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm text-gray-500">Your Score</div>
                    <div className="text-3xl font-bold text-gray-900">{percentage}%</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-gray-500">Correct</div>
                    <div className="text-xl font-semibold text-gray-900">{correct}{totalQuestions ? ` / ${totalQuestions}` : ""}</div>
                  </div>
                </div>
                <div className="mt-4">
                  <div className="w-full h-2 bg-gray-200 rounded">
                    <div
                      className={`h-2 rounded ${percentage >= 70 ? "bg-emerald-500" : percentage >= 40 ? "bg-amber-500" : "bg-rose-500"}`}
                      style={{ width: `${Math.min(Math.max(percentage, 0), 100)}%` }}
                    />
                  </div>
                </div>
                <div className="mt-3 text-sm text-gray-600">
                  {percentage >= 70 ? "Great job!" : percentage >= 40 ? "Good effort—review and try again." : "Keep practicing—you can improve!"}
                </div>
              </div>
            );
          })()
        )}
      </div>
    </div>
  );
};

export default TakeQuiz;
