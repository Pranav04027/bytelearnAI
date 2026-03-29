import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { createQuiz, getQuizExistsByVideoId } from "../../api/quizzes.js";

const emptyQuestion = () => ({ question: "", concept: "", options: [{ text: "" }, { text: "" }, { text: "" }, { text: "" }], correctIndex: 0 });

const CreateQuiz = () => {
  const navigate = useNavigate();
  const { videoId } = useParams();
  const [title, setTitle] = useState("");
  const [questions, setQuestions] = useState([emptyQuestion()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [exists, setExists] = useState(false);

  // Pre-check if quiz already exists for this video; if yes, redirect to take view
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const hasQuiz = await getQuizExistsByVideoId(videoId);
        if (!mounted) return;
        if (hasQuiz) {
          setExists(true);
          // Redirect to viewing/taking quiz if it already exists
          navigate(`/quizzes/${videoId}`, { replace: true });
        }
      } catch (_) {
        // ignore and allow creation attempt
      }
    })();
    return () => {
      mounted = false;
    };
  }, [videoId, navigate]);

  const addQuestion = () => setQuestions((q) => [...q, emptyQuestion()]);
  const removeQuestion = (idx) => setQuestions((q) => q.filter((_, i) => i !== idx));

  const updateQuestionText = (idx, text) => {
    setQuestions((q) => q.map((qq, i) => (i === idx ? { ...qq, question: text } : qq)));
  };

  const updateQuestionConcept = (idx, concept) => {
    setQuestions((q) => q.map((qq, i) => (i === idx ? { ...qq, concept } : qq)));
  };

  const updateOptionText = (qidx, oidx, text) => {
    setQuestions((q) =>
      q.map((qq, i) =>
        i === qidx ? { ...qq, options: qq.options.map((oo, j) => (j === oidx ? { ...oo, text } : oo)) } : qq
      )
    );
  };

  const setCorrectIndex = (qidx, val) => {
    setQuestions((q) => q.map((qq, i) => (i === qidx ? { ...qq, correctIndex: val } : qq)));
  };

  const onSave = async () => {
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      // Basic validation
      const sanitized = questions.map((q) => ({
        question: (q.question || "").trim(),
        concept: (q.concept || "").trim(),
        options: q.options.map((o) => ({ text: (o.text || "").trim() })),
        correctIndex: Number(q.correctIndex) || 0,
      }));

      if (sanitized.some((q) => !q.question)) {
        throw new Error("Each question must have text.");
      }
      if (sanitized.some((q) => q.options.filter((o) => !!o.text).length < 2)) {
        throw new Error("Each question must have at least 2 non-empty options.");
      }

      const payload = {
        // Backend create endpoint expects only questions array. Title is optional and ignored server-side.
        questions: sanitized.map((q) => {
          // Build filtered options but keep original indices to preserve correct selection
          const filteredWithIndex = q.options
            .map((o, i) => ({ text: o.text, i }))
            .filter((o) => !!o.text);

          // If the chosen correct option was empty and got filtered out, default to first option
          const hasChosen = filteredWithIndex.some((o) => o.i === q.correctIndex);
          const effectiveCorrectIndex = hasChosen
            ? q.correctIndex
            : (filteredWithIndex[0]?.i ?? 0);

          return {
            questionText: q.question,
            questionConcept: q.concept,
            options: filteredWithIndex.map((o) => ({
              text: o.text,
              isCorrect: o.i === effectiveCorrectIndex,
            })),
          };
        }),
      };

      await createQuiz(videoId, payload);
      setSaved(true);
    } catch (e) {
      const backendMsg = e?.data?.message || e?.response?.data?.message;
      // Friendly duplicate message hint
      const friendly = backendMsg?.toLowerCase().includes("could not create quiz")
        ? "A quiz for this video already exists."
        : backendMsg;
      setError(typeof e === "string" ? e : friendly || e?.message || "Failed to create quiz");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="bg-white shadow rounded-lg p-4">
        <h1 className="text-xl font-semibold text-gray-900">Create Quiz</h1>
        <p className="text-sm text-gray-600">Video ID: {videoId}</p>
      </div>

      <div className="bg-white shadow rounded-lg p-4 space-y-4">
        <input
          className="border rounded p-2 w-full"
          placeholder="Quiz title (optional)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />

        {questions.map((q, qi) => (
          <div key={qi} className="border rounded p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="font-medium text-gray-900">Question {qi + 1}</div>
              {questions.length > 1 && (
                <button className="text-sm text-red-600" onClick={() => removeQuestion(qi)}>Remove</button>
              )}
            </div>
            <input
              className="border rounded p-2 w-full"
              placeholder="Enter question text"
              value={q.question}
              onChange={(e) => updateQuestionText(qi, e.target.value)}
            />
            <input
              className="border rounded p-2 w-full"
              placeholder="Concept (e.g., JavaScript, React hooks)"
              value={q.concept}
              onChange={(e) => updateQuestionConcept(qi, e.target.value)}
            />
            <div className="space-y-2">
              <div className="text-xs text-gray-500">Select the radio button for the correct option.</div>
              {q.options.map((o, oi) => (
                <div key={oi} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name={`correct-${qi}`}
                    checked={q.correctIndex === oi}
                    onChange={() => setCorrectIndex(qi, oi)}
                  />
                  <input
                    className="border rounded p-2 w-full"
                    placeholder={`Option ${oi + 1}`}
                    value={o.text}
                    onChange={(e) => updateOptionText(qi, oi, e.target.value)}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}

        <div className="flex items-center gap-2">
          <button className="px-3 py-2 bg-gray-100 rounded hover:bg-gray-200" onClick={addQuestion}>Add Question</button>
          <button className="px-4 py-2 bg-indigo-600 text-white rounded disabled:opacity-50" onClick={onSave} disabled={saving || exists}>
            {saving ? "Saving..." : "Save Quiz"}
          </button>
        </div>

        {exists && (
          <div className="text-sm text-amber-700">A quiz already exists for this video. You were redirected to it.</div>
        )}
        {error && <div className="text-sm text-red-600">{error}</div>}
        {saved && (
          <div className="text-sm text-green-700">
            Quiz saved. <Link to={`/videos/${videoId}`} className="text-indigo-600">Back to video</Link>
          </div>
        )}
      </div>
    </div>
  );
};

export default CreateQuiz;
