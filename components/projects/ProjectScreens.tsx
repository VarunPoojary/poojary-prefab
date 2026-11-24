"use client";

import { useEffect } from "react";
import { ProjectDetails } from "./ProjectDetails";
import { ProjectFrame } from "./ProjectFrame";
import { ProjectProgress } from "./Progress";
import { ProjectAttendance } from "@/components/attendance/ProjectAttendance";
import { ProjectExpenses } from "@/components/expenses/ProjectExpenses";

export { ProjectLockedTab } from "./ProjectFrame";

/** Scrolls to #money / #timeline etc. once the section has rendered (links from notifications). */
function useHashScroll() {
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (!id) return;
    const t = setInterval(() => {
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        clearInterval(t);
      }
    }, 150);
    const stop = setTimeout(() => clearInterval(t), 4000);
    return () => {
      clearInterval(t);
      clearTimeout(stop);
    };
  }, []);
}

export function ProjectDetailsTab() {
  useHashScroll();
  return <ProjectFrame active="details">{(p) => <ProjectDetails p={p} />}</ProjectFrame>;
}

export function ProjectAttendanceTab() {
  return <ProjectFrame active="attendance">{(p) => <ProjectAttendance p={p} />}</ProjectFrame>;
}

export function ProjectExpensesTab() {
  return <ProjectFrame active="expenses">{(p) => <ProjectExpenses p={p} />}</ProjectFrame>;
}

export function ProjectProgressTab() {
  return <ProjectFrame active="progress">{(p) => <ProjectProgress p={p} />}</ProjectFrame>;
}
