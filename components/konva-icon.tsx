"use client";

import { createElement, useEffect, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Image as KonvaImage } from "react-konva";
import { ICON_BY_NAME } from "@/lib/catalog/map-icons";

const cache = new Map<string, HTMLImageElement>();

function iconImage(name: string, color: string): HTMLImageElement | undefined {
  const key = `${name}|${color}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const Icon = ICON_BY_NAME[name];
  if (!Icon) return undefined;
  const svg = renderToStaticMarkup(createElement(Icon, { color, size: 96 }));
  const img = new window.Image();
  img.src = "data:image/svg+xml;utf8," + encodeURIComponent(svg);
  cache.set(key, img);
  return img;
}

// Centered on (x, y), drawn `size`×`size` in Konva user units (mm on this stage).
export function KonvaIcon({ name, color, x, y, size }: {
  name: string;
  color: string;
  x: number;
  y: number;
  size: number;
}) {
  const [, force] = useState(0);
  const img = iconImage(name, color);
  useEffect(() => {
    if (!img || img.complete) return;
    const on = () => force((n) => n + 1);
    img.addEventListener("load", on);
    return () => img.removeEventListener("load", on);
  }, [img]);
  if (!img) return null;
  return <KonvaImage image={img} x={x - size / 2} y={y - size / 2} width={size} height={size} listening={false} />;
}
