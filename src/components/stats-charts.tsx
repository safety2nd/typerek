"use client";

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend, RadarChart, PolarGrid, PolarAngleAxis, Radar,
} from "recharts";
import type { PlayerStat, MatchdayPoints, ScoreDistribution } from "@/lib/stats";

const COLORS = ["#f59e0b", "#3b82f6", "#10b981", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316"];

export function PointsBarChart({ stats }: { stats: PlayerStat[] }) {
  const data = stats.map((s) => ({
    username: s.username.length > 10 ? s.username.slice(0, 8) + "…" : s.username,
    Dokładnie: s.exact_hits,
    Wynik: s.outcome_hits,
    Pudła: s.zero_hits,
  }));
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
        <XAxis dataKey="username" tick={{ fontSize: 12 }} />
        <YAxis tick={{ fontSize: 12 }} />
        <Tooltip />
        <Legend />
        <Bar dataKey="Dokładnie" stackId="a" fill="#10b981" />
        <Bar dataKey="Wynik" stackId="a" fill="#f59e0b" />
        <Bar dataKey="Pudła" stackId="a" fill="#6b7280" />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function AccuracyChart({ stats }: { stats: PlayerStat[] }) {
  const data = stats.map((s) => ({
    username: s.username.length > 10 ? s.username.slice(0, 8) + "…" : s.username,
    Dokładność: s.accuracy,
    "Bias dom": s.home_win_bias,
  }));
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
        <XAxis dataKey="username" tick={{ fontSize: 12 }} />
        <YAxis tick={{ fontSize: 12 }} domain={[0, 100]} />
        <Tooltip />
        <Legend />
        <Bar dataKey="Dokładność" fill="#3b82f6" />
        <Bar dataKey="Bias dom" fill="#ef4444" />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function PointsOverTimeChart({ data }: { data: MatchdayPoints[] }) {
  const matchdays = [...new Set(data.map((d) => d.matchday))].sort((a, b) => a - b);
  const players = [...new Set(data.map((d) => d.username))];

  // Build cumulative data per matchday
  const cumulative = new Map<string, number>();
  const chartData = matchdays.map((md) => {
    const row: Record<string, number> = { matchday: md };
    for (const p of players) {
      const entry = data.find((d) => d.username === p && d.matchday === md);
      cumulative.set(p, (cumulative.get(p) ?? 0) + (entry?.points ?? 0));
      row[p] = cumulative.get(p) ?? 0;
    }
    return row;
  });

  return (
    <ResponsiveContainer width="100%" height={350}>
      <LineChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
        <XAxis dataKey="matchday" tick={{ fontSize: 12 }} label={{ value: "Kolejka", position: "insideBottom", offset: -5, fontSize: 12 }} />
        <YAxis tick={{ fontSize: 12 }} />
        <Tooltip />
        <Legend />
        {players.map((p, i) => (
          <Line
            key={p}
            type="monotone"
            dataKey={p}
            stroke={COLORS[i % COLORS.length]}
            strokeWidth={2}
            dot={{ r: 3 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function ScoreDistributionChart({ data }: { data: ScoreDistribution[] }) {
  const top = data.slice(0, 12);
  const chartData = top.map((d) => ({
    score: d.score,
    Typy: d.predicted,
    Wyniki: d.actual,
  }));
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
        <XAxis dataKey="score" tick={{ fontSize: 12 }} />
        <YAxis tick={{ fontSize: 12 }} />
        <Tooltip />
        <Legend />
        <Bar dataKey="Typy" fill="#f59e0b" />
        <Bar dataKey="Wyniki" fill="#3b82f6" />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function PlayerRadar({ stats }: { stats: PlayerStat[] }) {
  const top = stats.slice(0, 6);
  const data = top.map((s) => ({
    player: s.username.length > 10 ? s.username.slice(0, 8) + "…" : s.username,
    Dokładność: s.accuracy,
    "Celne typy": s.scored > 0 ? Math.round((s.exact_hits + s.outcome_hits) / s.scored * 100) : 0,
  }));
  return (
    <ResponsiveContainer width="100%" height={300}>
      <RadarChart data={data}>
        <PolarGrid />
        <PolarAngleAxis dataKey="player" tick={{ fontSize: 11 }} />
        <Radar name="Dokładność" dataKey="Dokładność" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.3} />
        <Tooltip />
        <Legend />
      </RadarChart>
    </ResponsiveContainer>
  );
}