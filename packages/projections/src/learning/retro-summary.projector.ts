import type { LearningRecord, MissionRecord, RetroSummary } from "../../../contracts/src";

export function projectRetroSummary(input: {
  now: string;
  missions: MissionRecord[];
  learnings: LearningRecord[];
}): RetroSummary {
  const tagCounts = new Map<string, number>();
  for (const learning of input.learnings) {
    for (const tag of learning.tags) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
  }

  const topTags = Array.from(tagCounts.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((left, right) => right.count - left.count || left.tag.localeCompare(right.tag))
    .slice(0, 5);

  return {
    generatedAt: input.now,
    missionCount: input.missions.length,
    completedMissions: input.missions.filter((mission) => mission.status === "completed").length,
    learningsCount: input.learnings.length,
    topTags,
    recentLearnings: input.learnings.slice(0, 5),
    recommendedFocus: recommendedFocus(topTags),
  };
}

function recommendedFocus(topTags: Array<{ tag: string; count: number }>): string[] {
  if (topTags.length === 0) {
    return ["Capture at least one learning after each mission close-out."];
  }

  return topTags.slice(0, 3).map((item) => `Review repeated pattern: ${item.tag}`);
}
