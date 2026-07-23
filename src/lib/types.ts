export type FixtureStatus = "SCHEDULED" | "TIMED" | "IN_PLAY" | "FINISHED" | "CANCELLED";

export interface Fixture {
  id: number;
  matchday: number | null;
  matchday_name: string | null;
  season: string | null;
  competition: string | null;
  home_team: string;
  away_team: string;
  home_team_crest: string | null;
  away_team_crest: string | null;
  utc_date: string;
  status: FixtureStatus;
  home_score: number | null;
  away_score: number | null;
}

export interface Prediction {
  id: string;
  user_id: string;
  fixture_id: number;
  home_score: number;
  away_score: number;
  points: number | null;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  username: string;
  is_admin: boolean;
  created_at: string;
}

export interface LeaderboardRow {
  user_id: string;
  username: string;
  total_points: number;
  scored_predictions: number;
  exact_hits: number;
  outcome_hits: number;
  total_predictions: number;
}

export interface PredictionWithProfile extends Prediction {
  username: string;
}

export interface FixtureWithPrediction extends Fixture {
  my_prediction?: Prediction | null;
}