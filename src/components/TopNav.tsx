"use client";

import Link from "next/link";

export type TopNavUser = {
  username: string;
  isAdmin: boolean;
  teamRole: string | null;
};

export default function TopNav({
  user,
}: {
  user: TopNavUser | null;
}) {
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <header className="border-b border-[color:var(--brand)] bg-[color:var(--topbar-bg)] text-[color:var(--topbar-foreground)]">
      <div className="flex w-full items-center justify-between px-4 py-2">
        <div className="flex items-center gap-4">
          {/* Desktop navigation */}
          <nav className="hidden items-center gap-5 text-base sm:flex">
            <Link className="hover:underline" href="/statistik">
              Statistik
            </Link>
            <Link className="hover:underline" href="/test">
              Test
            </Link>
            <Link className="hover:underline" href="/playbook">
              Playbook
            </Link>
            <Link className="hover:underline" href="/oevelser">
              Øvelser
            </Link>
            <Link className="hover:underline" href="/skemaer">
              Skemaer
            </Link>

            {user?.isAdmin ? (
              <Link className="hover:underline" href="/admin">
                Admin
              </Link>
            ) : null}

            {user?.teamRole === "LEADER" ? (
              <Link className="hover:underline" href="/leder">
                Leder
              </Link>
            ) : null}
          </nav>

          {/* Mobile dropdown */}
          <details className="relative sm:hidden">
            <summary className="cursor-pointer select-none rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm">
              Menu
            </summary>
            <div className="absolute left-0 z-50 mt-2 w-56 rounded-md border border-zinc-200 bg-white p-2 text-sm shadow-sm">
              <div className="flex flex-col">
                <Link className="rounded px-2 py-1 hover:bg-zinc-50" href="/statistik">
                  Statistik
                </Link>
                <Link className="rounded px-2 py-1 hover:bg-zinc-50" href="/test">
                  Test
                </Link>
                <Link className="rounded px-2 py-1 hover:bg-zinc-50" href="/playbook">
                  Playbook
                </Link>
                <Link className="rounded px-2 py-1 hover:bg-zinc-50" href="/oevelser">
                  Øvelser
                </Link>
                <Link className="rounded px-2 py-1 hover:bg-zinc-50" href="/skemaer">
                  Skemaer
                </Link>

                {user?.isAdmin ? (
                  <Link className="rounded px-2 py-1 hover:bg-zinc-50" href="/admin">
                    Admin
                  </Link>
                ) : null}

                {user?.teamRole === "LEADER" ? (
                  <Link className="rounded px-2 py-1 hover:bg-zinc-50" href="/leder">
                    Leder
                  </Link>
                ) : null}

                {user ? (
                  <>
                    <div className="my-1 border-t border-zinc-200" />
                    <button
                      type="button"
                      onClick={logout}
                      className="w-full rounded px-2 py-1 text-left hover:bg-zinc-50"
                    >
                      Log ud
                    </button>
                    <Link className="rounded px-2 py-1 hover:bg-zinc-50" href="/tilfoej-rolle">
                      Tilføj Rolle
                    </Link>
                  </>
                ) : null}
              </div>
            </div>
          </details>
        </div>

        <div className="flex items-center gap-3 text-base">
          {user ? (
            <details className="relative">
              <summary className="cursor-pointer list-none font-medium select-none">
                {user.username}
              </summary>
              <div className="absolute right-0 z-50 mt-2 w-44 rounded-md border border-zinc-200 bg-white p-2 text-sm text-zinc-900 shadow-sm">
                <div className="flex flex-col">
                  <Link className="rounded px-2 py-1 hover:bg-zinc-50" href="/tilfoej-rolle">
                    Tilføj Rolle
                  </Link>
                  <button
                    type="button"
                    onClick={logout}
                    className="rounded px-2 py-1 text-left hover:bg-zinc-50"
                  >
                    Log ud
                  </button>
                </div>
              </div>
            </details>
          ) : (
            <Link className="hover:underline" href="/login">
              Log ind
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
