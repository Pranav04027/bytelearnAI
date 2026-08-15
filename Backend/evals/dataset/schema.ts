export type QuestionCategory =
  | "direct"
  | "paraphrase"
  | "exact_term"
  | "multi_evidence"
  | "unanswerable";

export interface GoldEvidence {
  startMs: number;
  endMs: number;
  text: string;
}

export interface EvaluationExample {
  id: string;
  videoId: string;

  question: string;
  category: QuestionCategory;
  answerable: boolean;

  referenceAnswer: string | null;
  requiredFacts: string[];

  goldEvidence: GoldEvidence[];

  metadata?: {
    notes?: string;
  };
} 