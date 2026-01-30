"use client";

import { usePathname } from "next/navigation";
import TeamSlicer, { type TeamOption } from "@/components/TeamSlicer";
import StatsSidebarSlicers from "@/components/stats/StatsSidebarSlicers";
import TaktiktavleSidebar from "@/components/taktiktavle/TaktiktavleSidebar";

export default function AppSidebarContent({
  isAdmin,
  teams,
  selectedTeamId,
}: {
  isAdmin: boolean;
  teams: TeamOption[];
  selectedTeamId: string | null;
}) {
  const pathname = usePathname();
  const isTaktiktavle = pathname === "/taktiktavle" || pathname.startsWith("/taktiktavle/");
  const isStatistik = pathname === "/statistik" || pathname.startsWith("/statistik/");

  return (
    <>
      {/* No slicers at all on Taktiktavle */}
      {!isTaktiktavle ? (
        <div className="mt-4">
          <TeamSlicer isAdmin={isAdmin} teams={teams} selectedTeamId={selectedTeamId} />
        </div>
      ) : null}

      {isStatistik ? <StatsSidebarSlicers /> : null}
      {isTaktiktavle ? <TaktiktavleSidebar /> : null}
    </>
  );
}
