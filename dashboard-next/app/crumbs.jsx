"use client";

import { usePathname } from "next/navigation";
import { Topbar } from "@/design/components/shell";

const CRUMBS = {
  "/":            ["Analytics", "Overview"],
  "/circuit":     ["Analytics", "Circuit deep-dive"],
  "/report":      ["Analytics", "Pirelli report card"],
  "/circuits":    ["Analytics", "Circuit profiles"],
  "/weather":     ["Analytics", "Weather impact"],
  "/strategy":    ["New", "Strategy lab"],
  "/allocation":  ["New", "Allocation calendar"],
  "/compare":     ["New", "Compound vs compound"],
  "/explorer":    ["Tools", "SQL explorer"],
};

export function Crumbs() {
  const pathname = usePathname();
  const crumbs = CRUMBS[pathname] || ["Analytics", "Overview"];
  return <Topbar crumbs={crumbs} />;
}
