/**
 * RiskSparkline.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * A lightweight pure-SVG sparkline for the Project Detail risk score trend.
 * No external charting library — just math and SVG paths.
 *
 * Props:
 *   data      — array of { riskScore: number, scoredAt: Date } oldest-first
 *   width     — SVG width (default 120)
 *   height    — SVG height (default 32)
 *   className — optional Tailwind classes
 */

import React, { useMemo } from "react";

interface SparkPoint {
  riskScore: number;
  scoredAt: Date | string;
}

interface RiskSparklineProps {
  data: SparkPoint[];
  width?: number;
  height?: number;
  className?: string;
}

function getTrendColor(data: SparkPoint[]): { stroke: string; fill: string; label: string } {
  if (data.length < 2) return { stroke: "#94a3b8", fill: "#94a3b820", label: "flat" };
  const first = data[0].riskScore;
  const last = data[data.length - 1].riskScore;
  const delta = last - first;
  if (delta > 3) return { stroke: "#ef4444", fill: "#ef444420", label: "worsening" }; // red
  if (delta < -3) return { stroke: "#22c55e", fill: "#22c55e20", label: "improving" }; // green
  return { stroke: "#94a3b8", fill: "#94a3b820", label: "flat" }; // neutral
}

export function RiskSparkline({ data, width = 120, height = 32, className }: RiskSparklineProps) {
  const { polyline, area, trend } = useMemo(() => {
    if (!data || data.length < 2) return { polyline: "", area: "", trend: getTrendColor([]) };

    const scores = data.map((d) => d.riskScore);
    const minScore = Math.max(0, Math.min(...scores) - 5);
    const maxScore = Math.min(100, Math.max(...scores) + 5);
    const range = maxScore - minScore || 1;

    const pad = 3;
    const usableW = width - pad * 2;
    const usableH = height - pad * 2;

    const points = scores.map((score, i) => {
      const x = pad + (i / (scores.length - 1)) * usableW;
      const y = pad + usableH - ((score - minScore) / range) * usableH;
      return { x, y };
    });

    const polyline = points.map((p) => `${p.x},${p.y}`).join(" ");

    // Closed area path for gradient fill
    const firstPt = points[0];
    const lastPt = points[points.length - 1];
    const area = [
      `M ${firstPt.x} ${height - pad}`,
      ...points.map((p) => `L ${p.x} ${p.y}`),
      `L ${lastPt.x} ${height - pad}`,
      "Z",
    ].join(" ");

    return { polyline, area, trend: getTrendColor(data) };
  }, [data, width, height]);

  if (!data || data.length < 2) {
    return (
      <span className={`text-xs text-muted-foreground italic ${className ?? ""}`}>
        No trend data yet
      </span>
    );
  }

  return (
    <div className={`flex items-center gap-2 ${className ?? ""}`}>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="overflow-visible"
        aria-label="Risk score trend sparkline"
      >
        {/* Area fill */}
        <path d={area} fill={trend.fill} />
        {/* Line */}
        <polyline
          points={polyline}
          fill="none"
          stroke={trend.stroke}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* End dot */}
        {(() => {
          const pts = polyline.split(" ");
          const last = pts[pts.length - 1]?.split(",");
          if (!last || last.length < 2) return null;
          return (
            <circle
              cx={parseFloat(last[0])}
              cy={parseFloat(last[1])}
              r={2.5}
              fill={trend.stroke}
            />
          );
        })()}
      </svg>
      <span
        className="text-xs font-medium"
        style={{ color: trend.stroke }}
      >
        {trend.label === "improving" ? "↓ improving" : trend.label === "worsening" ? "↑ worsening" : "→ stable"}
      </span>
    </div>
  );
}
