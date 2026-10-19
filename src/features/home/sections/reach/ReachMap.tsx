"use client";

import { memo, useRef, useState, type CSSProperties } from "react";
import { Reveal } from "@/components/ui/Reveal";
import { useElementRecordList } from "@/hooks/useElementList";
import { useScene } from "@/hooks/useScene";
import { cx } from "@/lib/cx";
import { DATA_SOURCES, SOURCE_FILTER_ORDER, type SourceFilter } from "./reach.data";
import { ReachScene, type PinElements, type RouteElements } from "./reach.scene";
import type { MapGround, ReachMapModel } from "./reach.types";
import styles from "./ReachSection.module.css";

const routeMaskId = (index: number) => `reach-route-mask-${index}`;

function SourceIcon({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 12 14">
      <path d="M6 0a6 6 0 016 6c0 4-6 8-6 8S0 10 0 6a6 6 0 016-6z" fill={color} />
    </svg>
  );
}

function PinDrop({ color }: { color: string }) {
  return (
    <svg className={styles.drop} viewBox="0 0 22 28">
      <path
        d="M11 1a10 10 0 0110 10c0 7-10 16-10 16S1 18 1 11A10 10 0 0111 1z"
        fill="#fff"
        stroke={color}
        strokeWidth="2.4"
      />
      <circle cx="11" cy="11" r="4" fill={color} />
    </svg>
  );
}

/** Country outlines (or the dot-grid fallback). Memoised: it never changes, but the legend re-renders its parent. */
const MapGroundLayer = memo(function MapGroundLayer({ ground }: { ground: MapGround }) {
  if (ground.kind === "countries") {
    return (
      <g>
        {ground.paths.map((path, index) => (
          <path key={index} className={styles.land} d={path} />
        ))}
      </g>
    );
  }

  return (
    <g>
      {ground.dots.map(([cx, cy]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={1.4} fill="#dfe1e8" />
      ))}
    </g>
  );
});

interface SourceLegendProps {
  active: SourceFilter;
  onChange: (filter: SourceFilter) => void;
}

function SourceLegend({ active, onChange }: SourceLegendProps) {
  const buttonClass = (filter: SourceFilter) => cx(styles.legendButton, active === filter && styles.legendButtonActive);

  return (
    <Reveal className={styles.legend}>
      <div className={styles.legendPills}>
        <button type="button" className={buttonClass("all")} onClick={() => onChange("all")}>
          All sources
        </button>
        {SOURCE_FILTER_ORDER.map((key) => (
          <button key={key} type="button" className={buttonClass(key)} onClick={() => onChange(key)}>
            <SourceIcon color={DATA_SOURCES[key].color} />
            {DATA_SOURCES[key].label}
          </button>
        ))}
      </div>
    </Reveal>
  );
}

interface ReachMapProps {
  model: ReachMapModel;
}

/** The source legend and the animated world map it filters. */
export function ReachMap({ model }: ReachMapProps) {
  const [filter, setFilter] = useState<SourceFilter>("all");
  const mapRef = useRef<HTMLDivElement>(null);
  const routes = useElementRecordList<RouteElements>(model.primaryRoutes.length);
  const pins = useElementRecordList<PinElements>(model.pins.length);

  useScene(() => {
    const scene = new ReachScene({
      map: mapRef.current!,
      routes: routes.read(),
      pins: pins.read(),
      buyerCounts: model.pins.map((pin) => pin.buyers),
    });
    scene.start();
    return () => scene.dispose();
  });

  return (
    <>
      <div className="center">
        <SourceLegend active={filter} onChange={setFilter} />
      </div>

      <div ref={mapRef} className={styles.map}>
        <svg viewBox={model.viewBox}>
          <MapGroundLayer ground={model.ground} />
          <defs>
            {model.primaryRoutes.map((path, index) => (
              <mask key={index} id={routeMaskId(index)} maskUnits="userSpaceOnUse">
                <path ref={routes.register(index, "cover")} d={path} fill="none" stroke="#fff" strokeWidth={8} />
              </mask>
            ))}
          </defs>
          <g>
            {model.primaryRoutes.map((path, index) => (
              <g key={index}>
                <path className={styles.routeGhost} d={path} mask={`url(#${routeMaskId(index)})`} />
                <path
                  ref={routes.register(index, "path")}
                  className={styles.route}
                  d={path}
                  mask={`url(#${routeMaskId(index)})`}
                />
                <circle ref={routes.register(index, "drawDot")} r={5} fill="#ff4a1c" opacity={0} />
              </g>
            ))}
            {model.secondaryRoutes.map((path, index) => (
              <path key={index} className={styles.route} d={path} opacity={0.45} />
            ))}
            {model.primaryRoutes.map((_, index) => (
              <g key={index}>
                <circle ref={routes.register(index, "cometGlow")} r={11} fill="#ff4a1c" opacity={0} />
                <circle ref={routes.register(index, "cometDot")} r={4.5} fill="#ff4a1c" opacity={0} />
              </g>
            ))}
          </g>
        </svg>

        {model.pins.map((pin, index) => {
          const source = DATA_SOURCES[pin.source];
          const isDimmed = filter !== "all" && pin.source !== filter;
          return (
            <div
              key={pin.city}
              ref={pins.register(index, "pin")}
              className={cx(styles.pin, pin.labelAbove && styles.pinAbove, isDimmed && styles.pinDimmed)}
              style={{ left: pin.left, top: pin.top, "--c": source.color } as CSSProperties}
            >
              <i className={styles.pinRipple} style={{ animationDelay: `${-index * 0.37}s` }} />
              <PinDrop color={source.color} />
              <div className={styles.pinLabel}>
                <small>
                  {/* Text is driven by the scene's count-up animation. */}
                  <i ref={pins.register(index, "counter")}>0</i> buyers
                </small>
                <b>{pin.city}</b>
                <span className={styles.sourceTag} style={{ background: source.color }}>
                  {index + 1}. {source.label}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
