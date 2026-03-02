export type ElevPoint = { d_m: number; e_m: number };

type SteepSegment = {
  from_m: number;
  to_m: number;
  dist_m: number;
  grade: number;
};

type LongestClimb = {
  from_m: number;
  to_m: number;
  dist_m: number;
  avgGrade: number;
  gain_m: number;
};

export type ElevationSegmentsSummary = {
  steep: SteepSegment | null;
  bestLen: LongestClimb | null;
  roll: "hilly" | "moderate" | "mild";
};

/**
 * Analyze an elevation profile into cyclist-friendly segments:
 * - steepest short climb
 * - longest sustained climb
 * - overall rolling index (how “up and down” it feels)
 */
export function analyzeElevationSegments(points: ElevPoint[]): ElevationSegmentsSummary | null {
  if (!points?.length || points.length < 3) return null;

  const segs: { i0: number; i1: number; dist_m: number; gain_m: number; grade: number }[] = [];

  for (let i = 1; i < points.length; i++) {
    const d = points[i].d_m - points[i - 1].d_m;
    if (d <= 0.5) continue;
    const de = points[i].e_m - points[i - 1].e_m;
    const grade = de / d;
    segs.push({ i0: i - 1, i1: i, dist_m: d, gain_m: Math.max(0, de), grade });
  }

  // Steepest meaningful climb segment
  let steep: SteepSegment | null = null;
  for (const s of segs) {
    if (s.dist_m < 40) continue;
    if (s.grade <= 0.002) continue;
    if (!steep || s.grade > steep.grade) {
      steep = {
        from_m: points[s.i0].d_m,
        to_m: points[s.i1].d_m,
        dist_m: s.dist_m,
        grade: s.grade,
      };
    }
  }

  // Longest net-up climb run
  let bestLen: LongestClimb | null = null;

  let runStart = 0;
  let runDist = 0;
  let runGain = 0;
  let runFrom = points[0].d_m;

  for (let i = 1; i < points.length; i++) {
    const d = points[i].d_m - points[i - 1].d_m;
    const de = points[i].e_m - points[i - 1].e_m;

    const up = de >= -0.4; // treat tiny negatives as flat

    if (up) {
      runDist += Math.max(0, d);
      runGain += Math.max(0, de);
    } else {
      if (runDist >= 350 && runGain >= 8) {
        const avgGrade = runGain / Math.max(1, runDist);
        if (!bestLen || runDist > bestLen.dist_m) {
          bestLen = {
            from_m: runFrom,
            to_m: points[i - 1].d_m,
            dist_m: runDist,
            avgGrade,
            gain_m: runGain,
          };
        }
      }
      runStart = i;
      runDist = 0;
      runGain = 0;
      runFrom = points[runStart].d_m;
    }
  }

  if (runDist >= 350 && runGain >= 8) {
    const avgGrade = runGain / Math.max(1, runDist);
    if (!bestLen || runDist > bestLen.dist_m) {
      bestLen = {
        from_m: runFrom,
        to_m: points[points.length - 1].d_m,
        dist_m: runDist,
        avgGrade,
        gain_m: runGain,
      };
    }
  }

  // Rolling index from grade variability
  const grades = segs
    .filter((s) => s.dist_m >= 40)
    .map((s) => s.grade)
    .filter((g) => Number.isFinite(g));

  const mean =
    grades.reduce((a, b) => a + b, 0) / Math.max(1, grades.length);
  const variance =
    grades.reduce((a, g) => a + (g - mean) * (g - mean), 0) /
    Math.max(1, grades.length);
  const stdev = Math.sqrt(variance);

  const roll: ElevationSegmentsSummary["roll"] =
    stdev >= 0.035 ? "hilly" : stdev >= 0.02 ? "moderate" : "mild";

  return { steep, bestLen, roll };
}

