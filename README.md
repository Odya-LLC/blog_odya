# Blog Odya — Yangiliklar O'zbek tilida

**https://blog.odya.uz** — AI, IT, texnologiya va kibersport yangiliklarini o'zbek tilida, **lotin va kirill** yozuvlarida chop etadigan onlayn nashr (OBLOG loyihasi).

Tizim jahon yetakchi IT-nashrlaridan (The Verge, TechCrunch, Habr, iXBT, Dexerto/HLTV) yangiliklarni har kuni yig'adi va to'liq manba nusxasini saqlaydi. Material o'zbek tilida SEO uchun qayta yoziladi: buni Claude agent MCP server orqali (Claude obunasi bilan) yoki editor qo'lda bajaradi. Admin yoki editor tekshirib chop etadi. Kirill versiyasi lotindan avtomatik tayyorlanadi. Post lotin va kirill Telegram kanallariga avtomatik yuboriladi.

**Stek:** Next.js (App Router) · Payload CMS 3 · PostgreSQL (Supabase) · Cloudflare R2 · Payload Jobs + Supabase `pg_cron` · MCP server · Telegram Bot API · Vercel.
**MVP hosting:** bepul tariflar (Vercel Hobby, Supabase Free, Cloudflare R2), keyin Vercel Pro yoki Contabo.

## Hujjatlar

| Hujjat | Mazmuni |
|---|---|
| [docs/TZ.md](docs/TZ.md) | Texnik vazifa (v1.2): maqsad, KPI, manbalar va mualliflik huquqi, arxitektura, lotin/kirill, bepul hosting va limitlar, workflow, MCP, Telegram, SEO, nofunksional talablar, ma'lumotlar modeli, kategoriyalar, dizayn yo'nalishi |
| [docs/PLAN.md](docs/PLAN.md) | Amalga oshirish rejasi: MVP (M0–M3, ~6 hafta) → o'sish bosqichlari, xavflar |
| [docs/TASKS.md](docs/TASKS.md) | MVP'ning 25 ta vazifasi: bog'liqlik tartibida, rol, ijrochi (agent / egasi), qabul qilish mezonlari |
| [docs/QUESTIONS.md](docs/QUESTIONS.md) | Barcha savollar bo'yicha qarorlar, kamchiliklar holati, takliflar |

## Holat

Hujjatlash tugadi (OBLOG-1), barcha savollar yopildi. Keyingi qadam — [TASKS.md](docs/TASKS.md) dagi vazifalarni Quiel orqali bajarish, birinchisi — M0-01 (repozitoriy skeleti).
