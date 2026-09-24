/**
 * `/bot` sahifasi matnlari (TZ §2.3, TASKS M2-02) — User-Agent'dagi havola
 * (`OdyaBlogBot/1.0 (+https://blog.odya.uz/bot)`) shu sahifaga olib keladi.
 * Lotin va kirill matnlari qo'lda yozilgan; apostrof — `ʻ` (U+02BB) va `ʼ` (U+02BC).
 */
import type { Locale } from '@blog-odya/shared'

import { USER_AGENT } from '@/scraping/userAgent'

/** Bot bo'yicha murojaatlar manzili. */
export const BOT_CONTACT_EMAIL = 'bot@odya.uz'

export const BOT_USER_AGENT = USER_AGENT

export const BOT_ROBOTS_EXAMPLE = 'User-agent: OdyaBlogBot\nDisallow: /'

export interface BotPageStrings {
  title: string
  metaDescription: string
  intro: string
  userAgentTitle: string
  rulesTitle: string
  rules: string[]
  blockTitle: string
  blockText: string
  contactTitle: string
  contactText: string
  contactNote: string
}

export const botStrings: Record<Locale, BotPageStrings> = {
  'uz-Latn': {
    title: 'OdyaBlogBot haqida',
    metaDescription:
      'OdyaBlogBot — Blog Odya tahririyatining yangiliklar roboti: qanday ishlaydi, robots.txt qoidalari va aloqa.',
    intro:
      'OdyaBlogBot — Blog Odya (blog.odya.uz) tahririyatining yangiliklarni kuzatish roboti. U texnologiya, sunʼiy intellekt va kibersport nashrlarining ommaviy RSS lentalarini oʻqiydi va tahririyat uchun yangi materiallar roʻyxatini tayyorlaydi.',
    userAgentTitle: 'User-Agent',
    rulesTitle: 'Bot qanday ishlaydi',
    rules: [
      'Avvalo RSS/Atom lentalari oʻqiladi; maqola sahifasi faqat bunga ruxsat bergan manbalarda yuklanadi.',
      'robots.txt qoidalariga amal qiladi (User-agent: OdyaBlogBot yoki *), Crawl-delay hisobga olinadi. robots.txt 24 soat davomida keshlanadi.',
      'Bitta domenga koʻpi bilan 10 soniyada 1 ta soʻrov yuboriladi.',
      'Paywall, login yoki obuna talab qiladigan sahifalarga kirmaydi, JavaScript bajarmaydi, rasmlarni yuklamaydi.',
      'Yigʻilgan matnlar ommaga chiqarilmaydi — faqat tahririyatning ichki arxivida saqlanadi (30 kun). Saytdagi materiallar faktlar asosida qayta yoziladi va har doim manbaga havola beriladi.',
    ],
    blockTitle: 'Botni cheklash',
    blockText:
      'Saytingizni OdyaBlogBot umuman koʻrmasligini istasangiz, robots.txt faylingizga quyidagini qoʻshing (yoki kerakli boʻlimlarni Disallow bilan yoping):',
    contactTitle: 'Aloqa',
    contactText:
      'Bot faoliyati boʻyicha savollar, shikoyatlar yoki toʻxtatish soʻrovlarini quyidagi manzilga yuboring:',
    contactNote: 'Murojaatlar 48 soat ichida koʻrib chiqiladi.',
  },
  'uz-Cyrl': {
    title: 'OdyaBlogBot ҳақида',
    metaDescription:
      'OdyaBlogBot — Блог Одя таҳририятининг янгиликлар роботи: қандай ишлайди, robots.txt қоидалари ва алоқа.',
    intro:
      'OdyaBlogBot — Блог Одя (blog.odya.uz) таҳририятининг янгиликларни кузатиш роботи. У технология, сунъий интеллект ва киберспорт нашрларининг оммавий RSS лентларини ўқийди ва таҳририят учун янги материаллар рўйхатини тайёрлайди.',
    userAgentTitle: 'User-Agent',
    rulesTitle: 'Бот қандай ишлайди',
    rules: [
      'Аввало RSS/Atom лентлари ўқилади; мақола саҳифаси фақат бунга рухсат берган манбаларда юкланади.',
      'robots.txt қоидаларига амал қилади (User-agent: OdyaBlogBot ёки *), Crawl-delay ҳисобга олинади. robots.txt 24 соат давомида кешланади.',
      'Битта доменга кўпи билан 10 сонияда 1 та сўров юборилади.',
      'Paywall, логин ёки обуна талаб қиладиган саҳифаларга кирмайди, JavaScript бажармайди, расмларни юкламайди.',
      'Йиғилган матнлар оммага чиқарилмайди — фақат таҳририятнинг ички архивида сақланади (30 кун). Сайтдаги материаллар фактлар асосида қайта ёзилади ва ҳар доим манбага ҳавола берилади.',
    ],
    blockTitle: 'Ботни чеклаш',
    blockText:
      'Сайтингизни OdyaBlogBot умуман кўрмаслигини истасангиз, robots.txt файлингизга қуйидагини қўшинг (ёки керакли бўлимларни Disallow билан ёпинг):',
    contactTitle: 'Алоқа',
    contactText:
      'Бот фаолияти бўйича саволлар, шикоятлар ёки тўхтатиш сўровларини қуйидаги манзилга юборинг:',
    contactNote: 'Мурожаатлар 48 соат ичида кўриб чиқилади.',
  },
}

export function getBotStrings(locale: Locale): BotPageStrings {
  return botStrings[locale]
}
