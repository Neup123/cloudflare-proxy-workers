# Cloudflare Workers כ־reverse proxy — Runbook

## התבנית

Worker אחד לכל שירות, על `workers.dev`, בפורט 443. אותו סקריפט (`worker.js`)
לכולם — רק משתנה הסביבה `TARGET_ORIGIN` משתנה. אין Worker אחד עם ניתוב לפי
נתיב: אפליקציות מניחות שהן יושבות בשורש, וניתוב לפי נתיב שובר אותן.

## המיפויים (סבב 1, 23/11/2026)

| Worker | מקור |
|---|---|
| `coolify.neuprni.workers.dev` | `https://chgr.duckdns.org:1004` — לוח Coolify + API |
| `n8n.neuprni.workers.dev` | `https://n8n.chgr.duckdns.org:1004` — ממשק n8n + Public API |
| `mcp.neuprni.workers.dev` | `https://mcp.chgr.duckdns.org:1004` — נקודת MCP של Coolify |

מחוץ להיקף בסבב הזה (יתווספו באותה תבנית בעתיד): דמו, PoCs, seating-pr,
downloader, obsi, browser, auth.

## מה הסקריפט עושה

- מעביר method, כותרות וגוף כלשונם (פרט לכותרות hop-by-hop).
- WebSocket (Upgrade / 101) עובר חי, כולל החיבור עצמו.
- משכתב `Location` בתשובות: הוסט המקור ← הוסט הפרוקסי, בלי :1004.
- משכתב `Set-Cookie`: `Domain` של דומיין המקור ← הוסט הפרוקסי.
- משכתב `WWW-Authenticate` אם הוא מצביע על המקור.
- משכתב כתובות מוחלטות של המקור בגוף תשובות JSON/HTML (לא־דחוסות):
  מטא־דאטה של OAuth ‏(issuer, ‏authorization/token/register, ‏resource),
  דפי התחברות/הסכמה וקישורים. SSE וסוגי גוף אחרים עוברים כזרם, ללא שינוי.
  לשם כך ה־Worker מבקש מהמקור גוף לא־דחוס (`accept-encoding: identity`).
- מעביר `Authorization` ו־`Cookie` כלשונם. בלי caching (`no-store`).
- מקור לא זמין ← 502 עם טקסט פשוט, בלי פרטים פנימיים.

## מגבלות ידועות

- גוף SSE (כולל תשובות MCP בזרם) אינו משוכתב — כתובות מקור בתוך תוצאות
  כלים, אם ישנן, נשארות כפי שהמקור החזיר.
- ה־Worker עושה fetch לשם ההוסט הציבורי + :1004, עם אימות TLS מחמיר.
  Traefik מנתב לפי כותרת Host — לכן ה־fetch חייב לשאת את שם ההוסט הציבורי.

## פריסה

דרישות: `curl`, `jq`, וטוקן API של Cloudflare עם הרשאת Workers Scripts: Edit
(בדשבורד: My Profile ← API Tokens ← Create Token ← תבנית "Edit Cloudflare Workers").
הטוקן נכנס רק בערוץ מאובטח — לעולם לא בצ'אט, לא בקוד, לא בלוגים.

```bash
CLOUDFLARE_API_TOKEN=<token> ./deploy.sh          # הכל
CLOUDFLARE_API_TOKEN=<token> ./deploy.sh n8n     # שירות אחד
```

אחרי הפריסה, לוודא שה־workers.dev של ה־Worker מופעל (Workers ← ה־Worker ←
Settings ← Domains). אם הכתובת לא עונה, להפעיל שם את המתג ולבדוק שוב.

## אימות חי

```bash
curl -sI https://coolify.neuprni.workers.dev/   # מצופה: 302 אל /login על אותו הוסט
curl -sI https://n8n.neuprni.workers.dev/       # מצופה: 200
curl -s  https://mcp.neuprni.workers.dev/ -o /dev/null -w "%{http_code}\n"  # כמו המקור
```

ולהשוות מול המקור הישיר (`:1004`) באותו נתיב: סטטוס וכותרות מרכזיות זהים,
פרט ל־`Location`/`Set-Cookie` המשוכתבים.

## הוספת שירות

1. להוסיף שורה אחת לטבלת `TARGETS` ב־`deploy.sh`: שם ה־Worker ← כתובת המקור
   (`https://<service>.chgr.duckdns.org:1004`).
2. להריץ `./deploy.sh <name>`.
3. לאמת חי לפי הסעיף למעלה, ולהוסיף שורה לטבלת המיפויים כאן.
4. אם השירות מאחורי Authelia — להוסיף גם Worker ל־`auth` (ההפניות ל־auth
   ישוכתבו אליו אוטומטית רק אם קיים Worker בשם המתאים).
