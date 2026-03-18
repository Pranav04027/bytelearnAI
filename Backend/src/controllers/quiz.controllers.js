import { prisma } from "../db/index.js";

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

    const quiz = await prisma.quiz.create({
      data: {
        videoId: videoId,
        questions: {
          create: questions.map(q => ({
            questionText: q.questionText,
            options: {
              create: q.options.map(opt => ({
                text: opt.text,
                isCorrect: opt.isCorrect
              }))
            }
          }))
        }
      },
      include: {
        questions: {
          include: { options: true }
        }
      }
    });

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
    
    const results = answers.map((answer) => {
      const question = quiz.questions.find(
        (q) => q.id === answer.question
      );
      if (!question) return null;

      const selected = question.options.find(
        (opt) => opt.id === answer.selectedOption
      );

      if (selected?.isCorrect) score += 1;

      return {
        question: question.id,
        selectedOption: selected?.id || null,
        isCorrect: selected?.isCorrect || false,
      };
    }).filter(Boolean);

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
        result: results,
      },
      message: "Quiz submitted"
    });
  } catch (err) {
    next(err);
  }
};

export { createQuiz, getQuizByVideo, submitQuiz, isquiz };
