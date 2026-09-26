import { NextResponse } from "next/server";

/**
 * Auth forms normally submit JSON via fetch, but if the user submits before
 * the page hydrates the browser sends a native form POST instead. These
 * helpers let a route accept both and answer native posts with a redirect.
 */
export function isFormPost(req: Request) {
  const type = req.headers.get("content-type") || "";
  return (
    type.includes("application/x-www-form-urlencoded") || type.includes("multipart/form-data")
  );
}

export async function readBody(req: Request): Promise<Record<string, unknown>> {
  if (!isFormPost(req)) return req.json();
  const fd = await req.formData();
  const body: Record<string, unknown> = {};
  for (const [key, value] of fd.entries()) {
    // Treat empty optional fields as missing, matching the fetch path.
    if (typeof value === "string" && value !== "") body[key] = value;
  }
  return body;
}

/** Convert a JSON route response into a 303 redirect for native form posts. */
export async function toFormRedirect(res: NextResponse, successPath: string, failPath: string) {
  let location = successPath;
  if (res.status >= 400) {
    const data = await res.json().catch(() => ({}));
    const error = typeof data.error === "string" ? data.error : "Something went wrong";
    location = `${failPath}?error=${encodeURIComponent(error)}`;
  }
  // Relative Location keeps the redirect on whatever host the user came in on (e.g. ngrok).
  return new NextResponse(null, { status: 303, headers: { Location: location } });
}
