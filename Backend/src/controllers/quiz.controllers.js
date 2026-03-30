import { prisma } from "../db/index.js";
import { saveInMem } from "../utils/supermemory.js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import {retriveFromMem} from "../utils/supermemory.js"

const geminiApiKey = process.env.GEMINI_API_KEY;
const genAI = geminiApiKey ? new GoogleGenerativeAI(geminiApiKey) : null;
const attemptLimit = parseInt(process.env.QUIZ_ATTEMPT_LIMIT) || 2;

const aiModel = genAI?.getGenerativeModel({
  model: "gemini-2.5-flash-lite",
  generationConfig: {
    temperature: 0.7,
    topP: 0.95,
    topK: 64,
    maxOutputTokens: 8192,
    responseMimeType: "text/plain",
  },
});


const extractJson = (text) => {
  const trimmed = text.trim();

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return trimmed;
  }

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const jsonMatch = trimmed.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  return jsonMatch?.[0]?.trim() || trimmed;
};

const normalizeQuestions = (rawQuestions = []) =>
  rawQuestions
    .map((question) => {
      const questionText = question?.questionText?.trim() || question?.question?.trim() || "";
      const questionConcept = question?.questionConcept?.trim() || question?.concept?.trim() || "";
      const rawOptions = Array.isArray(question?.options) ? question.options : [];

      const options = rawOptions
        .map((option) => ({
          text: option?.text?.trim() || "",
          isCorrect: Boolean(option?.isCorrect),
        }))
        .filter((option) => option.text);

      const correctCount = options.filter((option) => option.isCorrect).length;

      if (!questionText || options.length < 2 || correctCount !== 1) {
        return null;
      }

      return {
        questionText,
        questionConcept: questionConcept || "General understanding",
        options,
      };
    })
    .filter(Boolean);

const createQuizRecord = async (videoId, questions) =>
  prisma.quiz.create({
    data: {
      videoId,
      questions: {
        create: questions.map((q) => ({
          questionText: q.questionText,
          questionConcept: q.questionConcept || "",
          options: {
            create: q.options.map((opt) => ({
              text: opt.text,
              isCorrect: opt.isCorrect,
            })),
          },
        })),
      },
    },
    include: {
      questions: {
        include: { options: true },
      },
    },
  });

const createQuizAI = async (req, res, next) => {
  try {
    const { videoId } = req.params;

    if (!videoId) {
      return res.status(400).json({ success: false, message: "The VideoId in params is invalid" });
    }
    const existingQuiz = await prisma.quiz.findUnique({
      where: { videoId },
      include: {
        questions: {
          include: { options: true },
        },
      },
    });

    if (existingQuiz) {
      return res.status(200).json({
        success: true,
        statusCode: 200,
        data: existingQuiz,
        message: "Quiz already exists for this video",
      });
    }

    const [video, transcription, transcriptChunks] = await Promise.all([
      prisma.video.findUnique({
        where: { id: videoId },
        select: { id: true, title: true, description: true, category: true, difficulty: true },
      }),
      prisma.transcription.findUnique({
        where: { videoId },
        select: { content: true, status: true },
      }),
      prisma.transcriptChunk.findMany({
        where: { videoId },
        orderBy: { chunkIndex: "asc" },
        take: 12,
        select: { chunkIndex: true, content: true },
      }),
    ]);

    if (!video) {
      return res.status(404).json({ success: false, message: "Video not found" });
    }

    const transcriptText = transcriptChunks.length
      ? transcriptChunks.map((chunk) => `[Chunk ${chunk.chunkIndex}] ${chunk.content}`).join("\n\n")
      : transcription?.content?.trim();

    if (!transcriptText) {
      return res.status(400).json({
        success: false,
        message: "Transcript is not ready for this video yet",
      });
    }

    let memory = "";
    try {
      memory = (await retriveFromMem(req.user.id))?.trim() || "";
    } catch (_) {
      memory = "";
    }

    const prompt = `
You are generating a learning quiz for a video lesson.

Video metadata:
- Title: ${video.title || "Untitled"}
- Category: ${video.category || "Unknown"}
- Difficulty: ${video.difficulty || "Unknown"}
- Description: ${video.description || "No description provided"}

Learner memory:
${memory || "No prior learner memory available."}

Transcript context:
${transcriptText}

Create exactly 5 multiple-choice questions based only on the transcript context.
Requirements:
- Questions must test important concepts actually covered in the video.
- Match the learner's weak areas from memory when relevant, but do not invent facts.
- Each question must have 4 options.
- Exactly 1 option must be correct.
- Include a short concept label in questionConcept.
- Avoid trick questions and avoid "all of the above" or "none of the above".
- Keep wording clear for a learner.

Return strict JSON only in this shape:
{
  "questions": [
    {
      "questionText": "string",
      "questionConcept": "string",
      "options": [
        { "text": "string", "isCorrect": false },
        { "text": "string", "isCorrect": true },
        { "text": "string", "isCorrect": false },
        { "text": "string", "isCorrect": false }
      ]
    }
  ]
}
`;

    const result = await aiModel.generateContent(prompt);
    const responseText = result?.response?.text?.() || "";
    const parsed = JSON.parse(extractJson(responseText));
    const questions = normalizeQuestions(parsed?.questions);

    if (questions.length < 3) {
      throw new Error("AI did not generate a valid quiz");
    }

    const quiz = await createQuizRecord(videoId, questions);

    return res.status(201).json({
      success: true,
      statusCode: 201,
      data: quiz,
      message: "AI quiz created",
    });
  } catch (err) {
    next(err);
  }
};

const createQuiz = async (req, res, next) => {
  try {
    const { videoId } = req.params;

    if (!videoId) {
      return res.status(400).json({ success: false, message: "The VideoId in params is invalid" });
    }
    const { questions } = req.body;

    if (!questions || !Array.isArray(questions)) {
      return res.status(400).json({ success: false, message: "Questions array is required" });
    }

    const normalizedQuestions = normalizeQuestions(questions);

    if (normalizedQuestions.length === 0) {
      return res.status(400).json({ success: false, message: "No valid questions were provided" });
    }

    const quiz = await createQuizRecord(videoId, normalizedQuestions);

    return res.status(201).json({
      success: true,
      statusCode: 201,
      data: quiz,
      message: "Quiz created"
    });
  } catch (err) {
    next(err);
  }
};


const getQuizByVideo = async (req, res, next) => {
  try {
    const { videoId } = req.params;

    if (!videoId) {
      return res.status(400).json({ success: false, message: "Invalid video ID" });
    }

    const quiz = await prisma.quiz.findUnique({
      where: { videoId: videoId },
      include: {
        questions: {
          include: { options: true }
        }
      }
    });

    if (!quiz) return res.status(404).json({ success: false, message: "Quiz not found for this video" });

    return res.status(200).json({
      success: true,
      statusCode: 200,
      data: quiz,
      message: "Quiz fetched"
    });
  } catch (err) {
    next(err);
  }
};

const isquiz = async (req, res, next) => {
  try {
    const { videoId } = req.params;

    if (!videoId) {
      return res.status(400).json({ success: false, message: "Invalid video ID" });
    }

    const quiz = await prisma.quiz.findUnique({
      where: { videoId: videoId },
      select: { id: true }
    });

    return res.status(200).json({
      success: true,
      statusCode: 200,
      data: { exists: !!quiz },
      message: "Quiz existence checked"
    });
  } catch (err) {
    next(err);
  }
};

const submitQuiz = async (req, res, next) => {
  try {
      const { videoId } = req.params;
      
    const { answers } = req.body;

    if (!videoId) {
      return res.status(400).json({ success: false, message: "Invalid video ID" });
    }

    if (!answers || !Array.isArray(answers)) {
      return res.status(400).json({ success: false, message: "Answers not exist or not in array format" });
    }

    const existingAttempts = await prisma.quizAttempt.count({
      where: { userId: req.user.id, videoId }
    });

    if (existingAttempts >= attemptLimit) {
      return res.status(403).json({ 
        success: false, 
        message: `Attempt limit reached (${attemptLimit}). You cannot submit again.` 
      });
    }

    const quiz = await prisma.quiz.findUnique({
      where: { videoId: videoId },
      include: {
        questions: {
          include: { options: true }
          }
      }
    });

    if (!quiz) return res.status(404).json({ success: false, message: "Quiz not found" });

    let score = 0;
    
    const correctConcepts = [];
    const wrongConcepts = [];
      
    const results = answers.map((answer) => {
      const question = quiz.questions.find(
        (q) => q.id === answer.question
      );
      if (!question) return null;

      const selected = question.options.find(
        (opt) => opt.id === answer.selectedOption
      );

        if (selected?.isCorrect) {
          score += 1;
          correctConcepts.push(question.questionConcept);  
        } else {
          wrongConcepts.push(question.questionConcept);
        }

      return {
        question: question.id,
        selectedOption: selected?.id || null,
        isCorrect: selected?.isCorrect || false,
      };
    }).filter(Boolean);
      
      const content = `
        Student scored ${Math.round((score / (quiz.questions.length || 1)) * 100)}%. 
        Struggles with: ${wrongConcepts.join(", ") || "none"}. 
        Strong on: ${correctConcepts.join(", ") || "none"}.`
      
    await saveInMem(req.user.id, content);

    const attempt = await prisma.quizAttempt.create({
      data: {
        userId: req.user.id,
        videoId: videoId,
        score: score,
        total: Math.round((score / (quiz.questions.length || 1)) * 100),
        submittedAnswers: {
          create: results.map(r => ({
            question: r.question,
            selectedOption: r.selectedOption,
            isCorrect: r.isCorrect
          }))
        }
      },
      include: {
        submittedAnswers: true
      }
    });

    return res.status(200).json({
      success: true,
      statusCode: 200,
      data: {
        attemptId: attempt.id,
        score,
        totalPercentage: attempt.total,
        totalQuestions: quiz.questions.length,
        correctAnswers: score,
        correctConcepts,
        wrongConcepts,
        result: results,
      },
      message: "Quiz submitted"
    });
  } catch (err) {
    next(err);
  }
};

export { createQuizAI, createQuiz, getQuizByVideo, submitQuiz, isquiz };
