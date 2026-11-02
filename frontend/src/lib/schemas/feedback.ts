export interface FeedbackOption {
  value: string;
  label: string;
}

export interface FeedbackPrompt {
  feature: string;
  title: string;
  question: string;
  choice_question: string;
  options: FeedbackOption[];
}

export interface FeedbackAnswer {
  feature: string;
  rating: number;
  choice: string | null;
}

export interface ChoiceCount {
  value: string;
  label: string;
  count: number;
}

export interface FeatureFeedback {
  feature: string;
  title: string;
  count: number;
  avg_rating: number;
  choices: ChoiceCount[];
}

export interface FeedbackEntry {
  id: string;
  created_at: string;
  feature: string;
  title: string;
  rating: number;
  choice_label: string | null;
  user_email: string | null;
  business_name: string | null;
}

export interface AdminFeedback {
  total: number;
  avg_rating: number;
  features: FeatureFeedback[];
  recent: FeedbackEntry[];
}
