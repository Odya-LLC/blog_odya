# Savollar, takliflar va kamchiliklar — OBLOG

Holat: **egasining birinchi javoblari olindi (2026-09-23)** — ular [TZ.md](TZ.md) v1.1 va [PLAN.md](PLAN.md) ga kiritildi. Qolgan ochiq savollar 2-bo'limda. Ularning har biri uchun **standart taxmin** yozilgan — javob kelguncha ish shu taxmin asosida davom etadi (TZ'da `[Taxmin]` bilan belgilangan).

**Muhimlik:** 🔴 — tegishli vazifadan oldin javob kerak, 🟡 — MVP launch'gacha, 🟢 — keyinroq.

---

## 1. Javob berilgan savollar ✅

| # | Savol | Egasining javobi | TZ/PLAN'dagi natija |
|---|---|---|---|
| Q1 | Brend nomi va domen? | **blog.odya.uz** | Domen `blog.odya.uz`, media `media.odya.uz`. Saytda ko'rinadigan brend nomi — ochiq (Q1-b) |
| Q2 | Mualliflik huquqi modeli? | **(a)** — faktlar asosida qayta yozish + atributsiya | TZ 2.3: qayta yozish, ochiq manba havolasi, manba rasmlari ishlatilmaydi |
| Q3 | 5 ta manba ma'qulmi? | **Ma'qul** | TZ 2.2: The Verge, TechCrunch, Habr (yangiliklar), iXBT, Dexerto/HLTV |
| Q7 | Tahririyat va publish huquqi? | Editor bo'ladi; **admin va editor**, ikkalasida publish huquqi bor | TZ 4.2: faqat 2 rol; AI agent editor kaliti bilan ishlaydi, publish qila olmaydi. Editorlar soni — ochiq (Q7-b) |
| Q9 | Til va yozuv? | **O'zbek, kirill va lotin** | TZ 3.6: lotin — asosiy, kirill — avtomatik (`lotin-kirill` + istisnolar lug'ati), qo'lda tuzatish; URL `/kr/...`; hreflang `uz-Latn`/`uz-Cyrl`. MVP'ga kiritildi |
| Q10 | AI inson tekshiruvisiz chop eta oladimi? | (Q7/Q17 javoblaridan) **Yo'q** — publish faqat admin/editor | MCP'da publish tool yo'q |
| Q15 | Stek ma'qulmi? | **Ma'qul** | Next.js + Payload CMS 3 + PostgreSQL + S3-mos media |
| Q16 | Hosting qayerda? | Server bor, hozircha aniq emas — Contabo yoki boshqa joy; Cloudflare qilinadi; **hozircha Supabase Postgres + Vercel bo'ladimi?** | **Ha, boshlash uchun bo'ladi** (TZ 3.7): Vercel Pro + Supabase Pro (Supavisor pooler) + Cloudflare R2 media; Redis/BullMQ o'rniga Payload Jobs + Vercel Cron; Vercel cheklovlari va yechimlari; Contabo'ga config-only ko'chish yo'li (PLAN M3-07, M4-01/02, M6-02) |
| Q17 | LLM byudjeti / API kaliti? | **MCP orqali obuna ishlatamiz, yoki editor o'zi qiladi** | TZ 5: server tomonidagi LLM pipeline yo'q (M6'da ixtiyoriy); **MCP server MVP'ning asosiy qismi** (PLAN M2-08); AI xarajati — 0 (obuna) |
| Q18 | Cloudflare ishlatish mumkinmi? | **Ha** (Q16 javobida) | DNS + R2 + media CDN; `blog` — DNS-only (Vercel davrida) |
| Q20 | MCP'dan kim foydalanadi? | Obunadagi Claude agent (Q17) | Claude Code (asosiy), Claude Desktop (`mcp-remote`); claude.ai connector — OAuth bilan M4'da |
| Q21 | Telegram kanal va avtopost? | **Avtopost kerak, Telegram kanal bor** | TZ 7.1, PLAN M3-01 — MVP'da. Qaysi yozuv yuborilishi — ochiq (Q21-b) |

---

## 2. Ochiq savollar

### 2.1. Launch uchun muhim
| # | Savol | Standart taxmin | Muhimlik |
|---|---|---|---|
| Q26 | Vercel, Supabase, Cloudflare hisoblari kimning nomiga ochiladi va kim to'laydi (Odya LLC korporativ karta)? `odya.uz` DNS allaqachon Cloudflare'dami? | Odya LLC nomiga; `odya.uz` zonasi Cloudflare'ga ko'chiriladi (agar hali bo'lmasa) — bu `odya.uz` ning boshqa yozuvlariga ham ta'sir qiladi, ehtiyotkorlik bilan | 🔴 (PLAN M0-05) |
| Q30 | MVP hosting byudjeti taxminan **$45–70/oy** (Vercel Pro + Supabase Pro + R2) — ma'qulmi? | Ha | 🔴 |
| Q1-b | Saytda ko'rinadigan brend nomi qanday: "Odya Blog", "Odya News" yoki boshqa? Logo bormi yoki designer yangisini chizadimi? | "Odya Blog", Odya brend ranglari asosida yangi logo varianti | 🔴 (PLAN M0-04) |
| Q21-b | Telegram kanalga qaysi yozuvda yuboriladi — lotin, kirill yoki ikkalasi (ikki alohida kanal)? Kanal username/ID qanday? | Faqat **lotin**, bitta kanal; kanal ID M0'da olinadi | 🟡 |
| Q7-b | Nechta editor bo'ladi va kimlar (ism, email)? Kim admin? | 1 admin + 1–2 editor | 🟡 |
| Q27 | Qaysi Claude obunasi (Pro / Max / Team) va nechta editor agentdan foydalanadi? | Har bir editorda Pro yoki Max; kuniga 10–20 maqola uchun Max tavsiya etiladi (Pro limitlari yetmasligi mumkin) | 🟡 |
| Q29 | Kirill versiyasini editor har bir postda tekshirishi shartmi yoki avtomatikaga ishonamizmi? | Avtomatik + sarlavha/lidni tezkor ko'z bilan tekshirish; xatolar istisnolar lug'atiga qo'shiladi | 🟡 |
| Q8 | Kuniga nechta maqola chop etish kerak? | 1-oy 5–10, 3-oydan 20+ | 🟡 |
| Q14 | Muqova rasmlari qayerdan olinadi (manba rasmlari ishlatilmaydi)? | Press-kit / rasmiy rasmlar + Unsplash/Pexels + editor AI yordamida generatsiya qilgan rasmlar (brend shabloni bilan) | 🟡 |
| Q12 | Kategoriyalar ro'yxati ma'qulmi (AI, Texnologiyalar, Gadjetlar, Dasturlash, Kibersport, O'yinlar, Kiberxavfsizlik, Startaplar)? | Shu ro'yxat | 🟡 |
| Q5 | OAV sifatida ro'yxatdan o'tish rejalashtirilganmi (Odya LLC nomidan)? | Egasi parallel hal qiladi; saytda yuridik ma'lumotlar "Biz haqimizda"da | 🟡 |
| Q24 | Dizayn uchun namuna saytlar bormi? | shadcn/ui asosida toza yangiliklar dizayni (The Verge / Habr uslubi), light/dark | 🟡 |

### 2.2. Keyinroq
| # | Savol | Standart taxmin | Muhimlik |
|---|---|---|---|
| Q28 | Contabo'ga qachon ko'chamiz — faqat worker (M4) yoki hammasi (M6)? | Launch'dan keyin, Vercel xarajati yoki limitlari sezilarli bo'lganda; birinchi navbatda faqat worker | 🟢 |
| Q4 | Monetizatsiya (reklama, homiylik, Telegram reklama)? | MVP'da reklama yo'q; M6'da AdSense / Yandex RSYA joylari | 🟢 |
| Q6 | Raqobatchilar va farqimiz? | Faqat IT/AI/kibersport, tezlik, lotin + kirill, texnik chuqurlik | 🟢 |
| Q11 | Postlarda "AI yordamida tayyorlangan" belgisi bo'lsinmi? | Ha, agent qayta yozgan postlarda | 🟢 |
| Q13 | O'z (noyob) kontent ham bo'ladimi — mahalliy IT yangiliklari, obzorlar? | Ha, CMS qo'llaydi; kontent rejasi — egasi | 🟢 |
| Q22 | Izohlar kerakmi? | Yo'q; muhokama — Telegram kanal izohlarida | 🟢 |
| Q23 | Email newsletter kerakmi? | M6 (UZ serverda) | 🟢 |
| Q25 | Analitika hisoblari (GA4, Metrica, GSC) kimning nomiga? | Odya LLC korporativ Google/Yandex akkaunti | 🟢 |
| Q31 | Rus tili versiyasi kerakmi? | Hozircha yo'q; arxitektura tayyor (M6) | 🟢 |

---

## 3. Kamchilik va xatolar (asl topshiriqda)

| # | Kamchilik / xato | Holat |
|---|---|---|
| 1 | **Mualliflik huquqi xavfi** e'tiborga olinmagan ("to'liq manbani tarjima qilib publish"). DMCA, Google "scaled content abuse", sud xavfi | ✅ Hal qilindi — model (a) tanlandi |
| 2 | Domen va brend nomi yo'q edi | ✅ Domen `blog.odya.uz`; brend nomi — Q1-b |
| 3 | Til va yozuv aniqlanmagan edi | ✅ Lotin + kirill |
| 4 | Byudjet ko'rsatilmagan | 🟡 AI — obuna; hosting — Q30 |
| 5 | Tahririyat (odamlar) aniqlanmagan | 🟡 Rollar aniq (admin + editor); soni — Q7-b |
| 6 | Kunlik publish hajmi aniqlanmagan | 🟡 Q8 |
| 7 | Monetizatsiya modeli yo'q | 🟢 Q4 |
| 8 | Izohlar va moderatsiya | 🟢 Q22 |
| 9 | **OAV sifatida ro'yxatdan o'tish** (AOKA) eslatilmagan | 🟡 Q5 |
| 10 | Telegram eslatilmagan edi — O'zbekistonda yangiliklarning asosiy kanali | ✅ Avtopost MVP'da |
| 11 | O'lchanadigan KPI yo'q ("birinchi o'rin" o'lchanmaydi) | ✅ TZ 1.3 da KPI jadvali |
| 12 | Dizayn / brending eslatilmagan | 🟡 Q1-b, Q24 |
| 13 | AI kontent siyosati yo'q | ✅ Inson publish qiladi; belgi — Q11 |
| 14 | Kibersport uchun faqat yangilik yetarli emas (natijalar, jadval, mahalliy jamoalar) | 🟢 M6-07 |
| 15 | Noyob (o'z) kontent rejasi yo'q — faqat qayta yozish bilan 1-o'ringa chiqish qiyin | 🟢 Q13 |
| 16 | Backup, xavfsizlik, huquqiy sahifalar eslatilmagan | ✅ TZ 9 |
| 17 | Habr va iXBT ikkalasi ham rus tilida — AI/kibersport bo'yicha birlamchi manbalar ingliz tilida | ✅ EN + RU aralash 5 manba |
| 18 | **Yangi (v1.1):** Vercel + Supabase tanlovi — O'zbekiston shaxsiy ma'lumotlar qonuni (fuqarolar ma'lumotlari UZ'da saqlanishi) | 🟡 MVP'da o'quvchi ma'lumoti yig'ilmaydi; newsletter/izohlardan oldin UZ server yoki yurist xulosasi |
| 19 | **Yangi (v1.1):** Kirill avtomatik transliteratsiyasi 100% to'g'ri emas (rus o'zlashmalari: `sentabr → сентябрь`, `ts → ц`, `ye/e`) | ✅ Istisnolar lug'ati + qo'lda tuzatish + qulflash (TZ 3.6); Q29 |
| 20 | **Yangi (v1.1):** Obuna orqali agent ishlashi — ish hajmi editor kompyuteri va obuna limitlariga bog'liq; avtomatik (kechasi) ishlamaydi | 🟡 Q27; kerak bo'lsa M6-01 (API bilan server pipeline) |

---

## 4. Takliflar

1. **"Faktlar + kontekst"** — har bir postga "O'zbekiston uchun bu nimani anglatadi" bloki (narxlar so'mda, mavjudligi, mahalliy analoglar). Huquqiy xavfni kamaytiradi va SEO'da noyob qiymat beradi.
2. **Agregatsiya** — bitta mavzu bo'yicha 2–3 manbani birlashtirib yozish (SimHash klasterlari orqali).
3. **Telegram-first** — sayt SEO uchun, Telegram tezkor auditoriya uchun; har bir postda kanalga obuna CTA.
4. **Kibersportda mahalliy burchak** — O'zbek jamoalari va turnirlari.
5. **Glossariy** vaqt o'tib alohida SEO-sahifa ("IT lug'at") bo'lishi mumkin — lotin va kirillda.
6. **Kichik MVP** — ~6.5 hafta; domen indeksatsiyasi erta boshlansin.
7. **Google News Publisher Center** va **Yandex** ga erta ro'yxatdan o'tish.
8. **Manbalar bilan hamkorlik** — Habr, 3DNews, Cybersport.ru ga tarjima/qayta nashr ruxsati bo'yicha xat.
9. **Agent ish tartibi** — editor har kuni ertalab va kechqurun MCP `daily_batch` prompt'i bilan 5–10 ta qoralama tayyorlaydi, keyin review qilib publish qiladi.
