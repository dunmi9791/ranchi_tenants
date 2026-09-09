import Link from "next/link";
import type { SessionUser } from "@/lib/session";
import { LogoutButton } from "./LogoutButton";

export function Nav({ user }: { user?: SessionUser | null }) {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <Link href="/" className="text-lg font-semibold text-emerald-700">
          Ranchi Tenants
        </Link>
        <nav className="flex items-center gap-3 text-sm">
          {user ? (
            <>
              <span className="hidden text-slate-500 sm:inline">{user.email}</span>
              <Link href="/dashboard" className="rounded-md px-2 py-1 hover:bg-slate-100">
                Dashboard
              </Link>
              {user.role === "ADMIN" && (
                <>
                  <Link href="/admin/companies" className="rounded-md px-2 py-1 hover:bg-slate-100">
                    Companies
                  </Link>
                  <Link href="/admin/meters" className="rounded-md px-2 py-1 hover:bg-slate-100">
                    Meters
                  </Link>
                </>
              )}
              <LogoutButton />
            </>
          ) : (
            <>
              <Link href="/login" className="rounded-md px-2 py-1 hover:bg-slate-100">
                Log in
              </Link>
              <Link
                href="/register"
                className="rounded-md bg-emerald-600 px-3 py-1.5 text-white hover:bg-emerald-700"
              >
                Register
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
