"use client";

import { useMemo, useRef, useState } from "react";
import type { GraphData, GraphNode } from "@/lib/types";

interface Positioned extends GraphNode {
  x: number;
  y: number;
  r: number;
}

const WIDTH = 900;
const HEIGHT = 560;
const CENTRE = { x: WIDTH / 2, y: HEIGHT / 2 };

const NODE_FILL: Record<GraphNode["type"], string> = {
  self: "#0f766e",
  company: "#ffffff",
  school: "#ffffff",
  person: "#ffffff",
  cluster: "#f5f5f4",
};

const NODE_STROKE: Record<GraphNode["type"], string> = {
  self: "#0f766e",
  company: "#0f766e",
  school: "#a8a29e",
  person: "#d6d3d1",
  cluster: "#d6d3d1",
};

const EDGE_STYLE: Record<string, { stroke: string; dash?: string }> = {
  works_at: { stroke: "#0f766e" },
  worked_at: { stroke: "#a8a29e", dash: "4 3" },
  studied_at: { stroke: "#a8a29e", dash: "2 3" },
  moved_to: { stroke: "#b45309" },
  in_cluster: { stroke: "#d6d3d1", dash: "2 4" },
};

/**
 * Deterministic radial layout.
 *
 * A force simulation would jitter between renders and cost a dependency; with a
 * hub graph the useful arrangement is a ring anyway. Larger hubs sit closer to
 * the centre so the eye lands on them first.
 */
function layout(data: GraphData): Positioned[] {
  const self = data.nodes.find((n) => n.type === "self");
  const others = data.nodes.filter((n) => n.type !== "self");
  const maxSize = Math.max(1, ...others.map((n) => n.size));

  const positioned: Positioned[] = [];
  if (self) positioned.push({ ...self, x: CENTRE.x, y: CENTRE.y, r: 18 });

  const ringCount = others.length <= 14 ? 1 : others.length <= 34 ? 2 : 3;
  const perRing = Math.ceil(others.length / ringCount);
  // A single ring can sit further out; extra rings have to leave room inside.
  const baseRadius = ringCount === 1 ? 190 : 140;
  const ringGap = ringCount === 1 ? 0 : 105;

  others.forEach((node, index) => {
    const ring = Math.floor(index / perRing);
    const positionInRing = index % perRing;
    const inThisRing = Math.min(perRing, others.length - ring * perRing);
    const angle = (positionInRing / inThisRing) * Math.PI * 2 - Math.PI / 2 + ring * 0.35;
    const radius = baseRadius + ring * ringGap;
    const weight = node.size / maxSize;
    positioned.push({
      ...node,
      x: CENTRE.x + Math.cos(angle) * radius * (node.type === "school" ? 1.12 : 1),
      y: CENTRE.y + Math.sin(angle) * radius * 0.92,
      r: node.type === "person" ? 6 : 8 + Math.round(weight * 14),
    });
  });

  return positioned;
}

export function NetworkGraph({
  data,
  onSelect,
  selectedId,
}: {
  data: GraphData;
  onSelect?: (node: GraphNode) => void;
  selectedId?: string | null;
}) {
  const nodes = useMemo(() => layout(data), [data]);
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [hovered, setHovered] = useState<string | null>(null);
  const drag = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);

  const viewWidth = WIDTH / zoom;
  const viewHeight = HEIGHT / zoom;
  const viewBox = `${CENTRE.x - viewWidth / 2 + pan.x} ${CENTRE.y - viewHeight / 2 + pan.y} ${viewWidth} ${viewHeight}`;

  const active = hovered ?? selectedId ?? null;
  const connectedIds = useMemo(() => {
    if (!active) return null;
    const set = new Set<string>([active]);
    for (const edge of data.edges) {
      if (edge.source === active) set.add(edge.target);
      if (edge.target === active) set.add(edge.source);
    }
    return set;
  }, [active, data.edges]);

  return (
    <div className="relative">
      <div className="absolute right-3 top-3 z-10 flex gap-1">
        {[
          { label: "Zoom in", symbol: "+", action: () => setZoom((z) => Math.min(3, z * 1.25)) },
          { label: "Zoom out", symbol: "−", action: () => setZoom((z) => Math.max(0.5, z / 1.25)) },
          {
            label: "Reset view",
            symbol: "⤺",
            action: () => {
              setZoom(1);
              setPan({ x: 0, y: 0 });
            },
          },
        ].map((button) => (
          <button
            key={button.label}
            type="button"
            aria-label={button.label}
            onClick={button.action}
            className="h-7 w-7 rounded-md border border-line-strong bg-surface text-ink-2 hover:bg-raised focus-ring"
          >
            {button.symbol}
          </button>
        ))}
      </div>

      <svg
        viewBox={viewBox}
        preserveAspectRatio="xMidYMid meet"
        className="h-[clamp(22rem,58vh,34rem)] w-full cursor-grab touch-none select-none active:cursor-grabbing"
        role="img"
        aria-label={`Network graph with ${nodes.length} nodes`}
        onPointerDown={(e) => {
          drag.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
          (e.target as Element).setPointerCapture?.(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          const scale = viewWidth / (e.currentTarget.clientWidth || WIDTH);
          setPan({
            x: drag.current.panX - (e.clientX - drag.current.x) * scale,
            y: drag.current.panY - (e.clientY - drag.current.y) * scale,
          });
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerLeave={() => {
          drag.current = null;
          setHovered(null);
        }}
      >
        <g>
          {data.edges.map((edge, i) => {
            const source = byId.get(edge.source);
            const target = byId.get(edge.target);
            if (!source || !target) return null;
            const style = EDGE_STYLE[edge.type] ?? EDGE_STYLE.works_at;
            const dimmed = connectedIds && !(connectedIds.has(edge.source) && connectedIds.has(edge.target));
            return (
              <line
                key={`${edge.source}-${edge.target}-${edge.type}-${i}`}
                x1={source.x}
                y1={source.y}
                x2={target.x}
                y2={target.y}
                stroke={style.stroke}
                strokeDasharray={style.dash}
                strokeWidth={Math.min(4, 0.6 + Math.log2(edge.weight + 1))}
                opacity={dimmed ? 0.08 : 0.35}
              />
            );
          })}
        </g>

        <g>
          {nodes.map((node) => {
            const dimmed = connectedIds && !connectedIds.has(node.id);
            const isSelected = selectedId === node.id;
            return (
              <g
                key={node.id}
                opacity={dimmed ? 0.25 : 1}
                onMouseEnter={() => setHovered(node.id)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => onSelect?.(node)}
                className={onSelect ? "cursor-pointer" : undefined}
                tabIndex={onSelect ? 0 : undefined}
                role={onSelect ? "button" : undefined}
                aria-label={`${node.label}, ${node.size} ${node.size === 1 ? "person" : "people"}`}
                onKeyDown={(e) => {
                  if (onSelect && (e.key === "Enter" || e.key === " ")) {
                    e.preventDefault();
                    onSelect(node);
                  }
                }}
              >
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={node.r}
                  fill={NODE_FILL[node.type]}
                  stroke={isSelected ? "#0f766e" : NODE_STROKE[node.type]}
                  strokeWidth={isSelected ? 3 : 1.5}
                />
                {(node.type !== "person" || nodes.length < 60) && (
                  <text
                    x={node.x}
                    y={node.y + node.r + 12}
                    textAnchor="middle"
                    fontSize={node.type === "self" ? 13 : 11}
                    fill="#57534e"
                    className="pointer-events-none"
                  >
                    {node.label.length > 22 ? `${node.label.slice(0, 21)}…` : node.label}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line px-5 py-2.5 text-caption text-ink-3">
        <LegendSwatch color="#0f766e" label="You" filled />
        <LegendSwatch color="#0f766e" label="Company" />
        <LegendSwatch color="#a8a29e" label="School" />
        <LegendLine color="#0f766e" label="Currently there" />
        <LegendLine color="#a8a29e" dash label="Previously there" />
        <LegendLine color="#b45309" label="Moved between" />
      </div>
    </div>
  );
}

function LegendSwatch({ color, label, filled }: { color: string; label: string; filled?: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      <svg width="12" height="12" aria-hidden>
        <circle cx="6" cy="6" r="5" fill={filled ? color : "#fff"} stroke={color} strokeWidth="1.5" />
      </svg>
      {label}
    </span>
  );
}

function LegendLine({ color, label, dash }: { color: string; label: string; dash?: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      <svg width="18" height="8" aria-hidden>
        <line
          x1="0"
          y1="4"
          x2="18"
          y2="4"
          stroke={color}
          strokeWidth="2"
          strokeDasharray={dash ? "4 3" : undefined}
        />
      </svg>
      {label}
    </span>
  );
}
