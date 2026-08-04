// redeploy from dashboard2
function cors(response) {
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", "https://bunmahoncgu.github.io");
  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  return new Response(response.body, { status: response.status, headers });
}

export class LiveUsersDO {
  constructor(state, env) {
    this.state = state;
  }

  async fetch(request) {
    const url = new URL(request.url);

 if (url.pathname.endsWith("/update")) {
  const data = await request.json();
  if (!data.userId) {
    return cors(Response.json({ status: "error", error: "Missing userId" }, { status: 400 }));
  }

  const tokenKey = "token:" + data.userId;
  const recordKey = "user:" + data.userId;

  // Token is stored separately from the location record so it survives
  // the 2-minute staleness cleanup below (which only deletes "user:" keys).
  const storedToken = await this.state.storage.get(tokenKey);
  let issuedToken = null;

  if (!storedToken) {
    // First time this userId has ever been seen — mint and persist a token for it.
    issuedToken = crypto.randomUUID();
    await this.state.storage.put(tokenKey, issuedToken);
  } else if (data.token !== storedToken) {
    return cors(Response.json({ status: "error", error: "Invalid or missing token" }, { status: 403 }));
  }

  // Load existing record if present
  const existing = await this.state.storage.get(recordKey) || {};

  // Sanitize team value
  let incomingTeam = data.team;

  // Reject only true invalid values
  if (
    incomingTeam === undefined ||
    incomingTeam === null ||
    incomingTeam === "undefined"
  ) {
    // Keep existing team if incoming is invalid
    incomingTeam = existing.team || "";
  }

  // IMPORTANT:
  // Allow deliberate change to No Team ("")
  // So we do NOT reject empty string.

  // Build safe record (never persist the token inside the location record itself)
  const { token, ...dataWithoutToken } = data;
  const safeRecord = {
    ...existing,
    ...dataWithoutToken,
    team: incomingTeam
  };

  await this.state.storage.put(recordKey, safeRecord);

  const responseBody = { status: "ok" };
  if (issuedToken) responseBody.token = issuedToken;
  return cors(Response.json(responseBody));
}



    if (url.pathname.endsWith("/verify-token")) {
      const data = await request.json();
      if (!data.userId) {
        return cors(Response.json({ valid: false, error: "Missing userId" }, { status: 400 }));
      }

      const tokenKey = "token:" + data.userId;
      const storedToken = await this.state.storage.get(tokenKey);

      if (!storedToken) {
        // First-ever contact for this userId via ANY authenticated action
        // (not just /location/update) — mint and persist a token now.
        const issuedToken = crypto.randomUUID();
        await this.state.storage.put(tokenKey, issuedToken);
        return cors(Response.json({ valid: true, token: issuedToken }));
      }

      if (data.token !== storedToken) {
        return cors(Response.json({ valid: false, error: "Invalid or missing token" }));
      }

      return cors(Response.json({ valid: true }));
    }

    if (url.pathname.endsWith("/all")) {
      const now = Date.now();
      const users = [];

      const list = await this.state.storage.list({ prefix: "user:" });

      for (const [key, value] of list) {
        if (!value) continue;

        const age = now - new Date(value.timestamp).getTime();
        if (age > 120000) {
          await this.state.storage.delete(key);
          continue;
        }

        users.push(value);
      }

      return cors(new Response(JSON.stringify({ users }), {
        headers: { "Content-Type": "application/json" }
      }));
    }

    return cors(new Response("Not found", { status: 404 }));
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "https://bunmahoncgu.github.io",
          "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Max-Age": "86400"
        }
      });
    }

    if (request.method === "GET" && url.pathname === "/alerts") {
      const raw = await env.ALERTS_KV.get("alerts.json");
      const text = raw || JSON.stringify({ updates: [] }, null, 2);
      return new Response(text, {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "https://bunmahoncgu.github.io",
          "Cache-Control": "no-store, no-cache, must-revalidate",
          "Pragma": "no-cache",
          "Expires": "0"
        }
      });
    }

    if (request.method === "POST" && url.pathname === "/alerts") {
      try {
        const { message, pin, category, user, team, userId, token, lat, lng } = await request.json();

        if (!message || !category) {
          return Response.json({ status: "error", error: "Missing message or category" }, { status: 400, headers: { "Access-Control-Allow-Origin": "https://bunmahoncgu.github.io" } });
        }

        // Scenario/Description/Sighting/Other (and anything not explicitly
        // listed below) require the admin PIN. Team is posted automatically
        // by the app itself and only ever uses the per-device token, never
        // a PIN. Cleared can come from either the admin console (PIN) or
        // the map long-press flow (token).
        const TOKEN_ONLY_CATEGORIES = ["Team"];
        const PIN_OR_TOKEN_CATEGORIES = ["Cleared"];

        let authorized = false;
        let mintedToken = null;

        if (TOKEN_ONLY_CATEGORIES.includes(category)) {
          const result = await verifyDeviceToken(env, userId, token);
          authorized = result.valid;
          mintedToken = result.mintedToken;
          if (!authorized) {
            return Response.json({ status: "error", error: "Invalid or missing token" }, { status: 403, headers: { "Access-Control-Allow-Origin": "https://bunmahoncgu.github.io" } });
          }
        } else if (PIN_OR_TOKEN_CATEGORIES.includes(category)) {
          if (pin === env.ADMIN_PIN) {
            authorized = true;
          } else if (userId) {
            const result = await verifyDeviceToken(env, userId, token);
            authorized = result.valid;
            mintedToken = result.mintedToken;
          }
          if (!authorized) {
            return Response.json({ status: "error", error: "Invalid PIN or token" }, { status: 403, headers: { "Access-Control-Allow-Origin": "https://bunmahoncgu.github.io" } });
          }
        } else {
          // PIN-only categories (Scenario, Description, Sighting, Other, and
          // any future addition not explicitly listed above).
          if (pin !== env.ADMIN_PIN) {
            return Response.json({ status: "error", error: "Invalid PIN" }, { status: 403, headers: { "Access-Control-Allow-Origin": "https://bunmahoncgu.github.io" } });
          }
          authorized = true;
        }

        let existing = { updates: [] };
        const raw = await env.ALERTS_KV.get("alerts.json");
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            if (parsed && Array.isArray(parsed.updates)) { existing = parsed; }
          } catch (err) {}
        }

        // Prune anything older than 24h before appending — this used to be
        // a client-side-only display filter, so the stored file grew
        // forever. This piggybacks on the write this endpoint already
        // does, so it costs nothing extra.
        const pruneCutoff = Date.now() - 24 * 60 * 60 * 1000;
        existing.updates = existing.updates.filter(u => {
          const t = new Date(u.timestamp).getTime();
          return !isNaN(t) && t >= pruneCutoff;
        });

        const update = {
          message,
          category,
          user: user || "Unknown",
          team: team || "",
          timestamp: new Date().toISOString()
        };
        if (typeof lat === "number" && typeof lng === "number") {
          update.lat = lat;
          update.lng = lng;
        }
        existing.updates.unshift(update);
        await env.ALERTS_KV.put("alerts.json", JSON.stringify(existing, null, 2));

        // Surface a freshly-minted token (first-ever contact for this
        // userId via any authenticated action) so the client can save it.
        const responseBody = { status: "ok" };
        if (mintedToken) responseBody.token = mintedToken;

        return Response.json(responseBody, { headers: { "Access-Control-Allow-Origin": "https://bunmahoncgu.github.io" } });
      } catch (err) {
        return Response.json({ status: "error", error: err.toString() }, { status: 500, headers: { "Access-Control-Allow-Origin": "https://bunmahoncgu.github.io" } });
      }
    }

    // REVERSE GEOCODE (used by the map's long-press-to-clear flow)
    if (request.method === "GET" && url.pathname === "/reverse-geocode") {
      const lat = url.searchParams.get("lat");
      const lng = url.searchParams.get("lng");
      if (!lat || !lng) {
        return Response.json({ status: "error", error: "Missing lat or lng" }, {
          status: 400,
          headers: { "Access-Control-Allow-Origin": "https://bunmahoncgu.github.io" }
        });
      }
      try {
        // Browser fetch can't set a custom User-Agent; Nominatim's usage
        // policy expects one, so this proxies the request server-side.
        const nominatimRes = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}&format=json`,
          { headers: { "User-Agent": "BunmahonCGUAccessMap/1.0" } }
        );
        const data = await nominatimRes.json();
        return Response.json({ status: "ok", address: data.display_name || null }, {
          headers: { "Access-Control-Allow-Origin": "https://bunmahoncgu.github.io" }
        });
      } catch (err) {
        return Response.json({ status: "error", error: err.toString() }, {
          status: 500,
          headers: { "Access-Control-Allow-Origin": "https://bunmahoncgu.github.io" }
        });
      }
    }

    if (request.method === "POST" && url.pathname === "/token-health") {
      const result = await checkPatHealth(env);
      return Response.json({ debug: "token-health", raw: result }, { headers: { "Access-Control-Allow-Origin": "https://bunmahoncgu.github.io" } });
    }

    // LOCATION UPDATE
    if (request.method === "POST" && url.pathname === "/location/update") {
      try {
        const { userId, displayName, team, lat, lng, timestamp, token } = await request.json();
        if (userId == null || lat == null || lng == null || timestamp == null) {
          return Response.json({ status: "error", error: "Missing required fields" }, {
            status: 400,
            headers: { "Access-Control-Allow-Origin": "https://bunmahoncgu.github.io" }
          });
        }

        const id = env.LIVE_USERS_DO.idFromName("global");
        const stub = env.LIVE_USERS_DO.get(id);

        const internalReq = new Request("http://internal/location/update", {
          method: "POST",
          headers: new Headers(request.headers),
          body: JSON.stringify({ userId, displayName, team, lat, lng, timestamp, token })
        });

        const doResponse = await stub.fetch(internalReq);
        const doBody = await doResponse.text();

        return new Response(doBody, {
          status: doResponse.status,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "https://bunmahoncgu.github.io"
          }
        });
      } catch (err) {
        return Response.json({ status: "error", error: err.toString() }, {
          status: 500,
          headers: { "Access-Control-Allow-Origin": "https://bunmahoncgu.github.io" }
        });
      }
    }

    // LOCATION ALL
    if (request.method === "GET" && url.pathname === "/location/all") {
      try {
        const id = env.LIVE_USERS_DO.idFromName("global");
        const stub = env.LIVE_USERS_DO.get(id);

        const internalReq = new Request("https://internal/location/all", {
          method: "GET",
          headers: new Headers(request.headers)
        });

        const doResponse = await stub.fetch(internalReq);
        const body = await doResponse.text();

        return new Response(body, {
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "https://bunmahoncgu.github.io",
            "Cache-Control": "no-store"
          }
        });
      } catch (err) {
        return Response.json({ status: "error", error: err.toString() }, {
          status: 500,
          headers: { "Access-Control-Allow-Origin": "https://bunmahoncgu.github.io" }
        });
      }
    }

    return Response.json(
      { status: "error", error: "Unknown endpoint" },
      { status: 404, headers: { "Access-Control-Allow-Origin": "https://bunmahoncgu.github.io" } }
    );
  }
};

// Verifies a userId+token pair against the LiveUsersDO, which mints a
// token on a userId's first-ever contact (so a device that has never
// shared its location can still authenticate a Team/Cleared post).
// Returns { valid, mintedToken } — mintedToken is only set on first contact.
async function verifyDeviceToken(env, userId, token) {
  if (!userId) return { valid: false };
  const id = env.LIVE_USERS_DO.idFromName("global");
  const stub = env.LIVE_USERS_DO.get(id);
  const req = new Request("http://internal/verify-token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, token })
  });
  const res = await stub.fetch(req);
  const data = await res.json();
  return { valid: !!data.valid, mintedToken: data.token || null };
}

async function checkPatHealth(env) {
  try {
    const res = await fetch("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`, "User-Agent": "CloudflareWorker" }
    });
    if (!res.ok) { return { status: "error", error: `GitHub returned ${res.status}` }; }
    const expiry = res.headers.get("X-OAuth-Token-Expiration");
    if (!expiry) { return { status: "unknown", message: "GitHub did not return an expiration header.", days_remaining: null, expires_at: null }; }
    const expiresAt = new Date(expiry);
    const now = new Date();
    const diffDays = Math.floor((expiresAt - now) / (1000 * 60 * 60 * 24));
    return { status: "ok", expires_at: expiry, days_remaining: diffDays };
  } catch (err) {
    return { status: "error", error: err.toString() };
  }
}
