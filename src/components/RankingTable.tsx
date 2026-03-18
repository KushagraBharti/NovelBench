"use client";

import { Ranking, AggregatedScore } from "@/types";
import { getModelName } from "@/lib/models";

interface RankingTableProps {
  rankings: Ranking[];
  title: string;
}

function aggregateRankings(rankings: Ranking[]): AggregatedScore[] {
  const scoreMap = new Map<
    string,
    { totalRank: number; count: number }
  >();

  for (const ranking of rankings) {
    for (const entry of ranking.rankings) {
      const existing = scoreMap.get(entry.modelId) || {
        totalRank: 0,
        count: 0,
      };
      existing.totalRank += entry.rank;
      existing.count += 1;
      scoreMap.set(entry.modelId, existing);
    }
  }

  const scores: AggregatedScore[] = [];
  for (const [modelId, data] of scoreMap) {
    scores.push({
      modelId,
      modelName: getModelName(modelId),
      averageRank: data.count > 0 ? data.totalRank / data.count : 0,
      totalScore: 0,
      critiqueScoreAvg: 0,
    });
  }

  // Sort by average rank (lower is better)
  scores.sort((a, b) => a.averageRank - b.averageRank);

  return scores;
}

export default function RankingTable({ rankings, title }: RankingTableProps) {
  if (rankings.length === 0) return null;

  const aggregated = aggregateRankings(rankings);

  return (
    <div>
      <h3 className="text-lg font-semibold text-foreground mb-3">{title}</h3>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-gray-50">
              <th className="text-left px-4 py-2 text-sm font-medium text-gray-600">
                Place
              </th>
              <th className="text-left px-4 py-2 text-sm font-medium text-gray-600">
                Model
              </th>
              <th className="text-left px-4 py-2 text-sm font-medium text-gray-600">
                Avg Rank
              </th>
            </tr>
          </thead>
          <tbody>
            {aggregated.map((score, i) => (
              <tr
                key={score.modelId}
                className={`border-t border-gray-200 ${
                  i === 0 ? "bg-yellow-50" : ""
                }`}
              >
                <td className="px-4 py-3 text-sm">
                  {i === 0 ? "1st" : i === 1 ? "2nd" : i === 2 ? "3rd" : `${i + 1}th`}
                </td>
                <td className="px-4 py-3 text-sm font-medium">
                  {score.modelName}
                </td>
                <td className="px-4 py-3 text-sm">
                  {score.averageRank.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Individual judge rankings */}
      <details className="mt-3">
        <summary className="text-sm text-gray-500 cursor-pointer hover:text-gray-700">
          View individual judge rankings
        </summary>
        <div className="mt-2 space-y-3">
          {rankings.map((ranking) => (
            <div
              key={ranking.judgeModelId}
              className="text-sm border border-gray-100 rounded p-3"
            >
              <p className="font-medium mb-1">
                Judge: {getModelName(ranking.judgeModelId)}
              </p>
              <ol className="list-decimal list-inside space-y-1">
                {[...ranking.rankings]
                  .sort((a, b) => a.rank - b.rank)
                  .map((entry) => (
                    <li key={entry.modelId} className="text-gray-600">
                      {getModelName(entry.modelId)}
                      {entry.reasoning && (
                        <span className="text-gray-400">
                          {" "}
                          &mdash; {entry.reasoning}
                        </span>
                      )}
                    </li>
                  ))}
              </ol>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
