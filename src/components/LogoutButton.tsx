"use client";

export function LogoutButton() {
  return (
    <button
      type="button"
      className="rounded-md px-2 py-1 text-red-600 hover:bg-red-50"
      onClick={async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        window.location.href = "/";
      }}
    >
      Log out
    </button>
  );
}
