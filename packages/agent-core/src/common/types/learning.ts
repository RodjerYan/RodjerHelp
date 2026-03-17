export type LearningInsightCategory =
  | 'communication'
  | 'workflow'
  | 'quality'
  | 'safety'
  | 'domain';

export interface LearningInsight {
  id: string;
  key: string;
  title: string;
  content: string;
  category: LearningInsightCategory;
  scopeKey: string;
  scopeLabel?: string;
  tags: string[];
  confidence: number;
  occurrenceCount: number;
  sourceTaskId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LearningSettings {
  selfLearningEnabled: boolean;
  autoApplyLearning: boolean;
}
