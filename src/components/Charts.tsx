interface DonutSlice { label: string; value: number; color: string; }

export function Donut({ data, size = 180, thickness = 22, centerLabel, centerValue }: {
  data: DonutSlice[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerValue?: string;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const radius = size / 2 - thickness / 2 - 2;
  const c = 2 * Math.PI * radius;

  if (total === 0) {
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="var(--surface3)" strokeWidth={thickness} />
        {centerValue && (
          <text x={size/2} y={size/2} textAnchor="middle" dy="0.35em" fontSize="18" fontWeight="700" fill="var(--text-muted)">
            {centerValue}
          </text>
        )}
      </svg>
    );
  }

  let offset = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="var(--surface3)" strokeWidth={thickness} />
      {data.map((d, i) => {
        const frac = d.value / total;
        const arc = frac * c;
        const dashoffset = -((offset / total) * c);
        offset += d.value;
        return (
          <circle
            key={i}
            cx={size/2} cy={size/2} r={radius}
            fill="none"
            stroke={d.color}
            strokeWidth={thickness}
            strokeDasharray={`${arc} ${c}`}
            strokeDashoffset={dashoffset}
            strokeLinecap="butt"
          />
        );
      })}
      {(centerLabel || centerValue) && (
        <g style={{ transform: "rotate(90deg)", transformOrigin: "center" }}>
          {centerValue && (
            <text x={size/2} y={size/2 - 2} textAnchor="middle" fontSize="18" fontWeight="700" fill="var(--text)">
              {centerValue}
            </text>
          )}
          {centerLabel && (
            <text x={size/2} y={size/2 + 16} textAnchor="middle" fontSize="10" fontWeight="600" fill="var(--text-muted)" style={{ letterSpacing: "0.06em" }}>
              {centerLabel.toUpperCase()}
            </text>
          )}
        </g>
      )}
    </svg>
  );
}

interface BarPoint { label: string; income: number; expense: number; }

export function BarChart({ data, height = 180 }: { data: BarPoint[]; height?: number }) {
  const max = Math.max(1, ...data.flatMap(d => [d.income, d.expense]));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", gap: 6, height, alignItems: "flex-end", padding: "0 4px" }}>
        {data.map(d => (
          <div key={d.label} style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6, alignItems: "center", height: "100%" }}>
            <div style={{ display: "flex", gap: 3, height: "100%", alignItems: "flex-end", width: "100%", justifyContent: "center" }}>
              <div
                title={`Income: $${d.income.toFixed(0)}`}
                style={{
                  width: "40%", maxWidth: 18,
                  background: "linear-gradient(180deg, #34d399, #14b8a6)",
                  height: `${(d.income/max)*100}%`,
                  borderRadius: "5px 5px 0 0",
                  minHeight: d.income > 0 ? 2 : 0,
                  transition: "height 0.3s",
                }}
              />
              <div
                title={`Expense: $${d.expense.toFixed(0)}`}
                style={{
                  width: "40%", maxWidth: 18,
                  background: "linear-gradient(180deg, #fb7185, #f43f5e)",
                  height: `${(d.expense/max)*100}%`,
                  borderRadius: "5px 5px 0 0",
                  minHeight: d.expense > 0 ? 2 : 0,
                  transition: "height 0.3s",
                }}
              />
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 6, padding: "0 4px" }}>
        {data.map(d => (
          <div key={d.label} style={{ flex: 1, textAlign: "center", fontSize: 10, color: "var(--text-muted)", fontWeight: 600 }}>
            {d.label}
          </div>
        ))}
      </div>
    </div>
  );
}

export function Sparkline({ data, color = "var(--accent)", height = 36, width = 100 }: {
  data: number[]; color?: string; height?: number; width?: number;
}) {
  if (data.length < 2) return <svg width={width} height={height} />;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const step = width / (data.length - 1);
  const points = data.map((v, i) => `${i*step},${height - ((v - min)/range) * height}`).join(" ");
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <polyline fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" points={points} />
    </svg>
  );
}
