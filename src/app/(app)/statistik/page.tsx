import { TeamRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import StatistikClient from "@/components/stats/StatistikClient";

export default async function StatistikPage() {
  const user = await getCurrentUser();
  const isLeader = !!user && (user.isAdmin || user.activeRole === TeamRole.LEADER);

  return <StatistikClient isLeader={isLeader} />;
}
