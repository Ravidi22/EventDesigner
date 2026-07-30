import type { Metadata } from "next";
import { GanttScreen } from "./gantt-screen";

export const metadata: Metadata = { title: "גאנט אירועים · Eve" };

export default function GanttPage() {
  return <GanttScreen />;
}
