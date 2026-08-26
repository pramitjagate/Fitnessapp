import { prettyDate } from "@/lib/dates";
import type { LiftSeries, RpePoint, WeekAdherence } from "@/lib/analytics";
import { liftLabel } from "./components";

/* Hand-rolled SVG rather than a chart library. Three reasons: no dependency, no
   server-rendering workarounds, and sparklines are about forty lines of maths
   that are worth understanding once.

   Mark specs follow the same rules as the rest of the design — 2px lines, a
   faint area fill, an emphasised endpoint, recessive axes, and never a number
   printed on every point. */

const W = 260;
const H = 64;
const PAD = 6;

function path(points: number[], min: number, max: number): { line: string; area: string } {
  const span = max - min || 1;
  const stepX = (W - PAD * 2) / Math.max(1, points.length - 1);
  const coords = points.map((v, i) => {
    const x = PAD + i * stepX;
    const y = H - PAD - ((v - min) / span) * (H - PAD * 2);
    return [x, y] as const;
  });
  const line = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area =
    `${line} L${coords[coords.length - 1][0].toFixed(1)},${H - PAD} L${coords[0][0].toFixed(1)},${H - PAD} Z`;
  return { line, area };
}

/** One lift, eight weeks of load. Missed-rep weeks are marked. */
export function LoadSparkline({ series }: { series: LiftSeries }) {
  const values = series.points.map((p) => p.weightKg);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const { line, area } = path(values, min, max);
  const span = max - min || 1;
  const stepX = (W - PAD * 2) / Math.max(1, values.length - 1);

  const plateau = series.weeksFlat >= 2;

  return (
    <div className="spark">
      <div className="spark-head">
        <span className="spark-lift">{liftLabel(series.lift)}</span>
        <span className="spark-now">
          {series.currentKg}
          <span className="spark-unit">kg</span>
        </span>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="spark-svg"
        role="img"
        aria-label={`${liftLabel(series.lift)}: ${series.points.length} weeks, ${
          series.deltaKg >= 0 ? "up" : "down"
        } ${Math.abs(series.deltaKg)}kg, now ${series.currentKg}kg`}
      >
        <path d={area} className="spark-area" />
        <path d={line} className="spark-line" />
        {series.points.map((p, i) => {
          const x = PAD + i * stepX;
          const y = H - PAD - ((p.weightKg - min) / span) * (H - PAD * 2);
          const isLast = i === series.points.length - 1;
          if (!p.hitAllReps) {
            return <circle key={p.weekStart} cx={x} cy={y} r={4} className="spark-miss" />;
          }
          if (isLast) {
            return <circle key={p.weekStart} cx={x} cy={y} r={4} className="spark-end" />;
          }
          return null;
        })}
      </svg>

      <div className="spark-foot">
        <span className={series.deltaKg > 0 ? "delta delta--up" : "delta"}>
          {series.deltaKg > 0 ? "+" : ""}
          {series.deltaKg}kg over {series.points.length} weeks
        </span>
        {plateau && <span className="delta delta--flat">flat {series.weeksFlat} weeks</span>}
      </div>
    </div>
  );
}

/** Sessions logged per week. Adherence is the metric most likely to kill this. */
export function AdherenceStrip({ data }: { data: WeekAdherence[] }) {
  const totalLogged = data.reduce((a, w) => a + w.logged, 0);
  const totalPlanned = data.reduce((a, w) => a + w.planned, 0);
  const pct = totalPlanned ? Math.round((totalLogged / totalPlanned) * 100) : 0;

  return (
    <div className="card">
      <div className="card-head">
        <h3>Sessions logged</h3>
        <span className="stat">
          {pct}
          <span className="stat-unit">%</span>
        </span>
      </div>
      <div className="strip">
        {data.map((w) => (
          <div className="strip-week" key={w.weekStart}>
            <div className="strip-cells">
              {Array.from({ length: w.planned }).map((_, i) => (
                <span
                  key={i}
                  className={`cell${i < w.logged ? " cell--done" : ""}${
                    i < w.missedReps ? " cell--missed" : ""
                  }`}
                />
              ))}
            </div>
            <span className="strip-label">{prettyDate(w.weekStart).split(" ")[1]}</span>
          </div>
        ))}
      </div>
      <p className="tiny">
        Each block is one session · a darker block means reps were missed that session
      </p>
    </div>
  );
}

/** Average RPE per week — effort, as one line. */
export function RpeChart({ data }: { data: RpePoint[] }) {
  if (data.length < 2) return null;
  const values = data.map((d) => d.avgRpe);
  const min = Math.min(...values) - 0.4;
  const max = Math.max(...values) + 0.4;
  const { line, area } = path(values, min, max);
  const latest = data[data.length - 1];
  const first = data[0];
  const drift = Math.round((latest.avgRpe - first.avgRpe) * 10) / 10;

  return (
    <div className="card">
      <div className="card-head">
        <h3>Average effort</h3>
        <span className="stat">
          {latest.avgRpe}
          <span className="stat-unit">RPE</span>
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="spark-svg spark-svg--wide" role="img"
        aria-label={`Average RPE by week, currently ${latest.avgRpe}`}>
        <path d={area} className="spark-area" />
        <path d={line} className="spark-line" />
      </svg>
      <p className="tiny">
        {drift > 0.3
          ? `Up ${drift} since the block started — effort climbing is the earliest stall signal there is.`
          : drift < -0.3
            ? `Down ${Math.abs(drift)} since the block started. The work is getting cheaper.`
            : "Steady across the block."}
      </p>
    </div>
  );
}

/**
 * Twenty-one days of weigh-ins with the least-squares line through them.
 *
 * Both are drawn on purpose: the readings show how noisy bodyweight actually
 * is, the line shows what the loop reads. Plotting only the smoothed line would
 * hide the very thing that justifies smoothing it.
 */
export function WeightTrend({ points }: { points: { date: string; kg: number }[] }) {
  if (points.length < 2) {
    return <p className="tiny">Not enough weigh-ins yet — the trend needs at least six.</p>;
  }

  const values = points.map((p) => p.kg);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;

  /* X is the DAY OFFSET, not the reading's index. Skipped days have to show as
     gaps, and — more importantly — the line drawn here has to be the same line
     the decision engine fits. Spacing readings evenly ignores the skipped days
     and produced a chart quoting -0.26kg/week under a paragraph saying -0.22. */
  const day = (d: string) => Math.round(new Date(d + "T12:00:00").getTime() / 86400000);
  const first = day(points[0].date);
  const offsets = points.map((p) => day(p.date) - first);
  const lastOffset = offsets[offsets.length - 1] || 1;
  const xAt = (o: number) => PAD + (o / lastOffset) * (W - PAD * 2);
  const yAt = (v: number) => H - PAD - ((v - min) / span) * (H - PAD * 2);

  // Least-squares fit over day offsets — the same maths as weightTrendKgPerWeek.
  const n = values.length;
  const meanX = offsets.reduce((a, o) => a + o, 0) / n;
  const meanY = values.reduce((a, v) => a + v, 0) / n;
  const num = values.reduce((a, v, i) => a + (offsets[i] - meanX) * (v - meanY), 0);
  const den = offsets.reduce((a, o) => a + (o - meanX) ** 2, 0) || 1;
  const slope = num / den;
  const fit = (o: number) => meanY + slope * (o - meanX);
  const perWeek = Math.round(slope * 7 * 100) / 100;

  return (
    <div className="spark spark--wide">
      <div className="spark-head">
        <span className="spark-lift">Bodyweight</span>
        <span className="spark-now">
          {values[values.length - 1]}
          <span className="spark-unit">kg</span>
        </span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="spark-svg"
        role="img"
        aria-label={`Bodyweight over ${n} readings, trending ${perWeek}kg per week`}
      >
        {points.map((p, i) => (
          <circle key={p.date} cx={xAt(offsets[i])} cy={yAt(p.kg)} r={1.8} className="weight-dot" />
        ))}
        <line
          x1={xAt(0)}
          y1={yAt(fit(0))}
          x2={xAt(lastOffset)}
          y2={yAt(fit(lastOffset))}
          className="weight-fit"
        />
      </svg>
      <div className="spark-foot">
        <span className="tiny">
          {n} readings · {min}–{max}kg
        </span>
        <span className="tiny">
          {perWeek > 0 ? "+" : ""}
          {perWeek}kg per week
        </span>
      </div>
    </div>
  );
}
