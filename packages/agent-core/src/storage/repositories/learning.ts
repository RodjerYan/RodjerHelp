import type { LearningInsight } from '../../common/types/learning.js';
import { getDatabase } from '../database.js';

interface LearningInsightRow {
  id: string;
  insight_key: string;
  title: string;
  content: string;
  category: LearningInsight['category'];
  scope_key: string;
  scope_label: string | null;
  tags: string;
  confidence: number;
  occurrence_count: number;
  source_task_id: string | null;
  created_at: string;
  updated_at: string;
}

function parseTags(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((tag): tag is string => typeof tag === 'string');
  } catch {
    return [];
  }
}

function rowToInsight(row: LearningInsightRow): LearningInsight {
  return {
    id: row.id,
    key: row.insight_key,
    title: row.title,
    content: row.content,
    category: row.category,
    scopeKey: row.scope_key,
    scopeLabel: row.scope_label || undefined,
    tags: parseTags(row.tags),
    confidence: row.confidence,
    occurrenceCount: row.occurrence_count,
    sourceTaskId: row.source_task_id || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listLearningInsights(): LearningInsight[] {
  const db = getDatabase();
  const rows = db
    .prepare(
      `SELECT * FROM learning_insights
       ORDER BY occurrence_count DESC, confidence DESC, updated_at DESC`,
    )
    .all() as LearningInsightRow[];

  return rows.map(rowToInsight);
}

export function upsertLearningInsight(insight: LearningInsight): void {
  const db = getDatabase();
  const existing = db
    .prepare('SELECT * FROM learning_insights WHERE insight_key = ?')
    .get(insight.key) as LearningInsightRow | undefined;

  if (!existing) {
    db.prepare(
      `INSERT INTO learning_insights
       (id, insight_key, title, content, category, scope_key, scope_label, tags, confidence, occurrence_count, source_task_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      insight.id,
      insight.key,
      insight.title,
      insight.content,
      insight.category,
      insight.scopeKey,
      insight.scopeLabel || null,
      JSON.stringify(insight.tags),
      insight.confidence,
      Math.max(1, insight.occurrenceCount),
      insight.sourceTaskId || null,
      insight.createdAt,
      insight.updatedAt,
    );
    return;
  }

  const mergedTags = [...new Set([...parseTags(existing.tags), ...insight.tags])];
  const isSameSourceTask =
    Boolean(insight.sourceTaskId) && existing.source_task_id === insight.sourceTaskId;
  db.prepare(
    `UPDATE learning_insights
     SET title = ?,
         content = ?,
         category = ?,
         scope_key = ?,
         scope_label = ?,
         tags = ?,
         confidence = ?,
         occurrence_count = ?,
         source_task_id = ?,
         updated_at = ?
     WHERE insight_key = ?`,
  ).run(
    insight.title,
    insight.content,
    insight.category,
    insight.scopeKey,
    insight.scopeLabel || existing.scope_label,
    JSON.stringify(mergedTags),
    Math.max(existing.confidence, insight.confidence),
    isSameSourceTask
      ? existing.occurrence_count
      : existing.occurrence_count + Math.max(1, insight.occurrenceCount),
    insight.sourceTaskId || existing.source_task_id,
    insight.updatedAt,
    insight.key,
  );
}

export function deleteLearningInsight(insightId: string): void {
  const db = getDatabase();
  db.prepare('DELETE FROM learning_insights WHERE id = ?').run(insightId);
}

export function clearLearningInsights(): void {
  const db = getDatabase();
  db.prepare('DELETE FROM learning_insights').run();
}
