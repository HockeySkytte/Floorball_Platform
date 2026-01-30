"use client";

import { usePathname, useSearchParams } from "next/navigation";
import TeamSlicer, { type TeamOption } from "@/components/TeamSlicer";
import StatsSidebarSlicers from "@/components/stats/StatsSidebarSlicers";
import TaktiktavleSidebar from "@/components/taktiktavle/TaktiktavleSidebar";
import PlayerSlicer from "@/components/PlayerSlicer";
import SpillerVideoSidebarSlicers from "@/components/spiller/SpillerVideoSidebarSlicers";

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
  const searchParams = useSearchParams();
  const isTaktiktavle = pathname === "/taktiktavle" || pathname.startsWith("/taktiktavle/");
  const isStatistik = pathname === "/statistik" || pathname.startsWith("/statistik/");
  const isSpiller = pathname === "/spiller" || pathname.startsWith("/spiller/");
  const spillerTab = String(searchParams.get("tab") ?? "").toLowerCase();

  return (
    <>
      {/* No slicers at all on Taktiktavle */}
      {!isTaktiktavle ? (
        <div className="mt-4">
          <TeamSlicer isAdmin={isAdmin} teams={teams} selectedTeamId={selectedTeamId} />
        </div>
      ) : null}

      {isStatistik ? <StatsSidebarSlicers /> : null}
      {isSpiller ? <PlayerSlicer /> : null}
      {isSpiller && spillerTab === "video" ? <SpillerVideoSidebarSlicers /> : null}
      {isTaktiktavle ? <TaktiktavleSidebar /> : null}
    </>
  );
}
