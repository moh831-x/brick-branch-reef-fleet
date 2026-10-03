import { useEffect, useId, useMemo, useRef, useState, type PointerEvent } from "react";
import { Search } from "lucide-react";
import { buildPlot, graphSuggestions, parseGraphQuery, type GraphPlot } from "@/lib/graph";
import { fill, type UiCopy } from "@/lib/ui-copy";

/** Line colours: the site accent first, then colours that stay apart from it and from each other. */
const COLORS = ["var(--color-accent)", "#c2410c", "#2357c6", "#9333ea", "#a16207"];

/** Tick numbers with a true minus sign, the way they're typeset in math. */
function formatTick(value: number, digits = 6): string {
  const rounded = Number(value.toPrecision(digits));
  const text = Math.abs(rounded) >= 1e5 || (Math.abs(rounded) < 1e-3 && rounded !== 0) ? rounded.toExponential(1) : String(rounded);
  return text.replace(/^-/, "−");
}

/** The card's width in CSS pixels, so the SVG is drawn 1:1 (crisp lines, readable labels on phones). */
function useWidth<T extends HTMLElement>(fallback: number) {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const node = ref.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      const next = Math.round(entry?.contentRect.width ?? fallback);
      if (next > 0) setWidth(next);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [fallback]);
  return [ref, width] as const;
}

/**
 * The plot for a function search ("y = sin(x)", "plot x^2", "graph 2x + 1"). Renders nothing
 * otherwise. It sits inside the one AI answer, so it has no card or heading of its own.
 * The plot is always left to right, also on Arabic pages.
 */
export function GraphCard({ query, copy, onPick }: { query: string; copy: UiCopy; onPick: (query: string) => void }) {
  const request = useMemo(() => parseGraphQuery(query), [query]);
  const plot = useMemo(() => (request ? buildPlot(request) : null), [request]);
  const suggestions = useMemo(() => (request ? graphSuggestions(request) : []), [request]);
  const [boxRef, width] = useWidth<HTMLDivElement>(640);
  if (!request || !plot) return null;
  const names = plot.series.map((series) => series.label).join(", ");

  return (
    <div className="mt-3">
      <p className="text-base leading-relaxed text-ink">
        <GraphLead template={copy.graphLead} names={names} />
      </p>
      {plot.series.length > 1 ? (
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          {plot.series.map((series, index) => (
            <li key={series.label} className="font-display text-sm italic" style={{ color: COLORS[index % COLORS.length] }}>
              {series.label}
            </li>
          ))}
        </ul>
      ) : null}
      <div ref={boxRef} className="mt-3" dir="ltr">
        <GraphSvg plot={plot} width={width} copy={copy} names={names} />
      </div>
      <p className="mt-3 text-sm leading-relaxed text-muted">{copy.graphElse}</p>
      {suggestions.length ? (
        <div className="mt-3">
          <h3 className="text-xs font-medium tracking-wide text-muted uppercase">{copy.graphTry}</h3>
          <ul className="mt-2 flex flex-wrap gap-2">
            {suggestions.map((item) => (
              <li key={item}>
                <button
                  type="button"
                  onClick={() => onPick(item)}
                  className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-surface px-3 text-sm text-ink transition-transform duration-150 ease-out active:scale-[0.96]"
                >
                  <Search className="size-4 shrink-0 text-muted" aria-hidden="true" />
                  <bdi dir="ltr">{item}</bdi>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/** "A plot of {fns} on the coordinate plane." with the math kept left to right inside any language. */
function GraphLead({ template, names }: { template: string; names: string }) {
  const [before, after] = template.split("{fns}");
  return (
    <>
      <span>{before}</span>
      <bdi dir="ltr" className="font-display italic">
        {names}
      </bdi>
      <span>{after ?? ""}</span>
    </>
  );
}

function GraphSvg({ plot, width, copy, names }: { plot: GraphPlot; width: number; copy: UiCopy; names: string }) {
  const id = useId().replace(/:/g, "");
  const [hoverX, setHoverX] = useState<number | null>(null);
  const w = Math.max(260, width);
  const h = Math.round(Math.min(440, Math.max(240, w * 0.62)));
  const pad = { left: 14, right: 18, top: 16, bottom: 14 };
  const { xMin, xMax, yMin, yMax } = plot;
  const sx = (x: number) => pad.left + ((x - xMin) / (xMax - xMin)) * (w - pad.left - pad.right);
  const sy = (y: number) => pad.top + ((yMax - y) / (yMax - yMin)) * (h - pad.top - pad.bottom);
  // Axes sit at zero, or on the edge when zero is out of view.
  const axisY = sy(Math.min(Math.max(0, yMin), yMax));
  const axisX = sx(Math.min(Math.max(0, xMin), xMax));
  const span = yMax - yMin;
  const clampY = (y: number) => Math.min(yMax + span * 2, Math.max(yMin - span * 2, y));
  const fontSize = w < 420 ? 11 : 12.5;
  // Fewer labelled ticks on narrow screens.
  const every = (count: number, room: number) => Math.max(1, Math.ceil(count / Math.max(2, Math.floor(room / 34))));
  const xEvery = every(plot.xTicks.length, w);
  const yEvery = every(plot.yTicks.length, h);

  const paths = plot.series.map((series) =>
    series.segments
      .map((segment) => segment.map((point, index) => `${index ? "L" : "M"}${sx(point.x).toFixed(1)} ${sy(clampY(point.y)).toFixed(1)}`).join(""))
      .join(""),
  );

  const hover = hoverX == null ? null : plot.series.map((series) => {
    let best: { x: number; y: number } | null = null;
    for (const segment of series.segments) {
      for (const point of segment) {
        if (!best || Math.abs(point.x - hoverX) < Math.abs(best.x - hoverX)) best = point;
      }
    }
    return best;
  });

  function movePointer(event: PointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    const px = ((event.clientX - rect.left) / rect.width) * w;
    const x = xMin + ((px - pad.left) / (w - pad.left - pad.right)) * (xMax - xMin);
    setHoverX(x >= xMin && x <= xMax ? x : null);
  }

  const desc = fill(copy.graphRange, {
    xMin: formatTick(xMin, 3),
    xMax: formatTick(xMax, 3),
    yMin: formatTick(yMin, 3),
    yMax: formatTick(yMax, 3),
  });

  return (
    <svg
      role="img"
      aria-labelledby={`${id}-title ${id}-desc`}
      width="100%"
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className="block touch-none rounded-2xl bg-[color-mix(in_srgb,var(--color-accent-soft)_35%,var(--color-surface))]"
      style={{ fontFamily: "var(--font-display)" }}
      onPointerMove={movePointer}
      onPointerLeave={() => setHoverX(null)}
    >
      <title id={`${id}-title`}>{fill(copy.graphFigure, { fns: names })}</title>
      <desc id={`${id}-desc`}>{desc}</desc>
      <defs>
        <clipPath id={`${id}-clip`}>
          <rect x={pad.left} y={pad.top} width={w - pad.left - pad.right} height={h - pad.top - pad.bottom} />
        </clipPath>
        <marker id={`${id}-arrow`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 1 L9 5 L0 9 z" fill="var(--color-ink)" />
        </marker>
      </defs>

      <g stroke="var(--color-line)" strokeWidth="1" aria-hidden="true">
        {plot.xTicks.map((tick) => (
          <line key={`gx${tick}`} x1={sx(tick)} x2={sx(tick)} y1={pad.top} y2={h - pad.bottom} />
        ))}
        {plot.yTicks.map((tick) => (
          <line key={`gy${tick}`} x1={pad.left} x2={w - pad.right} y1={sy(tick)} y2={sy(tick)} />
        ))}
      </g>

      <g stroke="var(--color-ink)" strokeWidth="1.25" aria-hidden="true">
        <line x1={pad.left - 4} x2={w - pad.right + 6} y1={axisY} y2={axisY} markerStart={`url(#${id}-arrow)`} markerEnd={`url(#${id}-arrow)`} />
        <line x1={axisX} x2={axisX} y1={h - pad.bottom + 4} y2={pad.top - 6} markerStart={`url(#${id}-arrow)`} markerEnd={`url(#${id}-arrow)`} />
        {plot.xTicks.map((tick) => (tick === 0 ? null : <line key={`tx${tick}`} x1={sx(tick)} x2={sx(tick)} y1={axisY - 4} y2={axisY + 4} />))}
        {plot.yTicks.map((tick) => (tick === 0 ? null : <line key={`ty${tick}`} x1={axisX - 4} x2={axisX + 4} y1={sy(tick)} y2={sy(tick)} />))}
      </g>

      <g fill="var(--color-muted)" fontSize={fontSize}>
        {plot.xTicks.map((tick, index) =>
          tick === 0 || index % xEvery !== 0 ? null : (
            <text key={`lx${tick}`} x={sx(tick)} y={Math.min(h - 2, axisY + fontSize + 6)} textAnchor="middle">
              {formatTick(tick)}
            </text>
          ),
        )}
        {plot.yTicks.map((tick, index) =>
          tick === 0 || index % yEvery !== 0 ? null : (
            <text key={`ly${tick}`} x={axisX < 40 ? axisX + 8 : axisX - 8} y={sy(tick) + fontSize * 0.35} textAnchor={axisX < 40 ? "start" : "end"}>
              {formatTick(tick)}
            </text>
          ),
        )}
        {xMin < 0 && xMax > 0 && yMin < 0 && yMax > 0 &&
        !plot.xTicks.some((tick, index) => tick !== 0 && index % xEvery === 0 && Math.abs(sx(tick) - axisX) < fontSize * 2.6) ? (
          <text x={axisX - 6} y={axisY + fontSize + 4} textAnchor="end">
            0
          </text>
        ) : null}
      </g>

      <g fill="var(--color-ink)" fontSize={fontSize + 3} fontStyle="italic">
        <text x={w - pad.right - 2} y={axisY - 9} textAnchor="end">
          x
        </text>
        <text x={axisX + 9} y={pad.top + 6}>
          y
        </text>
      </g>

      <g clipPath={`url(#${id}-clip)`} fill="none" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round">
        {paths.map((d, index) => (
          <path key={plot.series[index]!.label + index} d={d} stroke={COLORS[index % COLORS.length]} />
        ))}
      </g>

      <g fontSize={fontSize + 1} fontStyle="italic">
        {hover && hoverX != null
          ? hover.map((point, index) => {
              if (!point || point.y < yMin || point.y > yMax) return null;
              const px = sx(point.x);
              const py = sy(point.y);
              const boxW = 78;
              const boxH = 34;
              const left = px + 12 + boxW > w - 4;
              const bx = left ? px - 12 - boxW : px + 12;
              const by = Math.min(Math.max(pad.top, py - boxH - 8), h - pad.bottom - boxH);
              return (
                <g key={plot.series[index]!.label}>
                  <line x1={px} x2={px} y1={pad.top} y2={h - pad.bottom} stroke="var(--color-muted)" strokeDasharray="3 3" />
                  <circle cx={px} cy={py} r="3.5" fill={COLORS[index % COLORS.length]} />
                  <rect x={bx} y={by} width={boxW} height={boxH} rx="8" fill="var(--color-surface)" stroke="var(--color-line)" />
                  <text x={bx + 8} y={by + 14} fill="var(--color-muted)">
                    x = {formatTick(point.x, 3)}
                  </text>
                  <text x={bx + 8} y={by + 28} fill={COLORS[index % COLORS.length]}>
                    y = {formatTick(point.y, 3)}
                  </text>
                </g>
              );
            })
          : null}
      </g>
    </svg>
  );
}
