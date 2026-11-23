// Cloudflare Worker — תבנית reverse proxy גנרית.
// Worker אחד לכל שירות. היעד מגיע ממשתנה סביבה TARGET_ORIGIN, למשל:
//   https://n8n.chgr.duckdns.org:1004
// ה־Worker מגיש את המקור על שם ההוסט שלו (workers.dev), בפורט 443.

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
]);

// הפניה מוחלטת שמצביעה על המקור הופכת לכתובת על הוסט הפרוקסי, ב־443.
function rewriteLocation(value, origin, proxyHost) {
  if (!value) return value;
  if (value === origin || value.startsWith(origin + "/")) {
    return "https://" + proxyHost + value.slice(origin.length);
  }
  const bare = origin.replace(/:\d+$/, "");
  if (value === bare || value.startsWith(bare + "/")) {
    return "https://" + proxyHost + value.slice(bare.length);
  }
  return value;
}

// עוגיה שתחומה לדומיין המקור עוברת לתחום של הוסט הפרוקסי.
function rewriteCookie(cookie, originHost, proxyHost) {
  return cookie.replace(/;\s*domain=[^;]*/gi, (m) => {
    const d = m.split("=")[1].trim().toLowerCase();
    if (d === originHost || d === "." + originHost || d.endsWith("." + originHost)) {
      return "; Domain=" + proxyHost;
    }
    return m;
  });
}

export default {
  async fetch(request, env) {
    const target = new URL(env.TARGET_ORIGIN);
    const reqUrl = new URL(request.url);
    const originUrl = target.origin + reqUrl.pathname + reqUrl.search;
    const proxyHost = reqUrl.hostname;
    const method = request.method;
    const hasBody = method !== "GET" && method !== "HEAD";

    const headers = new Headers(request.headers);
    for (const h of HOP_BY_HOP) headers.delete(h);
    headers.set("x-forwarded-host", proxyHost);
    headers.set("x-forwarded-proto", "https");

    let originResponse;
    try {
      originResponse = await fetch(originUrl, {
        method,
        headers,
        body: hasBody ? request.body : undefined,
        ...(hasBody ? { duplex: "half" } : {}),
        redirect: "manual",
        cf: { cacheEverything: false },
      });
    } catch (err) {
      return new Response("Bad gateway: origin unreachable", { status: 502 });
    }

    const resHeaders = new Headers(originResponse.headers);
    for (const h of HOP_BY_HOP) resHeaders.delete(h);
    const location = resHeaders.get("location");
    if (location) {
      resHeaders.set(
        "location",
        rewriteLocation(location, target.origin, proxyHost),
      );
    }
    const cookies = originResponse.headers.getSetCookie
      ? originResponse.headers.getSetCookie()
      : [];
    resHeaders.delete("set-cookie");
    for (const c of cookies) {
      resHeaders.append("set-cookie", rewriteCookie(c, target.hostname, proxyHost));
    }
    resHeaders.set("cache-control", "no-store");

    // WebSocket (101): מחזירים את החיבור החי עצמו, לא רק את הגוף.
    if (originResponse.status === 101 && originResponse.webSocket) {
      return new Response(null, {
        status: 101,
        statusText: originResponse.statusText,
        headers: resHeaders,
        webSocket: originResponse.webSocket,
      });
    }

    return new Response(originResponse.body, {
      status: originResponse.status,
      statusText: originResponse.statusText,
      headers: resHeaders,
    });
  },
};
