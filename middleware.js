// Server-side gate for /tour-map — runs on Vercel's Edge Runtime before any
// file under that path is served (HTML, JS, and the JSON data files alike),
// so it can't be bypassed the way a client-side JS password check could be
// (fetching /tour-map/data/agents.json directly would skip a JS-only gate
// entirely). Credentials are read from environment variables, never
// committed here, since this repo is public.
//
// Setup required in the Vercel dashboard (Project Settings > Environment
// Variables, added for both Production and Preview):
//   TOUR_MAP_USER
//   TOUR_MAP_PASS
// Redeploy after adding them. Until both are set, this locks the path down
// entirely (fails closed) rather than leaving it open.

export const config = {
  matcher: "/tour-map/:path*",
};

function unauthorized() {
  return new Response("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Tour Map"' },
  });
}

export default function middleware(request) {
  const expectedUser = process.env.TOUR_MAP_USER;
  const expectedPass = process.env.TOUR_MAP_PASS;

  if (!expectedUser || !expectedPass) {
    return unauthorized();
  }

  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Basic ")) {
    return unauthorized();
  }

  let decoded;
  try {
    decoded = atob(authHeader.slice(6));
  } catch {
    return unauthorized();
  }
  const sepIndex = decoded.indexOf(":");
  const user = sepIndex === -1 ? decoded : decoded.slice(0, sepIndex);
  const pass = sepIndex === -1 ? "" : decoded.slice(sepIndex + 1);

  if (user !== expectedUser || pass !== expectedPass) {
    return unauthorized();
  }
}
