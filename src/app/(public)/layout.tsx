import TopNav from "@/components/TopNav";
import { getCurrentUser } from "@/lib/auth";

export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  return (
    <div className="min-h-dvh">
      <TopNav
        user={
          user
            ? {
                username: user.username,
                isAdmin: user.isAdmin,
                teamRole: user.activeRole,
              }
            : null
        }
      />
      {children}
    </div>
  );
}
