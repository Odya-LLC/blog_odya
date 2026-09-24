import type { Locale } from '@blog-odya/shared'

import { AdSlot } from '@/components/blog/AdSlot'

/**
 * ArticleBody namunasi — M1-05 dagi Lexical renderer chiqaradigan elementlar: paragraf, H2/H3,
 * ro'yxat, havola, iqtibos, kod, jadval, rasm (figure). Ikkala yozuvda.
 */
export function SampleArticleBody({ locale }: { locale: Locale }) {
  if (locale === 'uz-Cyrl') {
    return (
      <>
        <p>
          OpenAI компанияси сешанба куни янги тил моделини тақдим этди. Компания маълумотига кўра,
          модель ўзбек, қозоқ ва тожик каби <strong>кам ресурсли тилларда</strong> олдинги
          версиясига нисбатан анча аниқ ишлайди. Янгилик ҳақида{' '}
          <a href="https://techcrunch.com">TechCrunch</a> биринчи бўлиб хабар берди.
        </p>
        <h2>Нималар ўзгарди?</h2>
        <p>
          Ишлаб чиқувчилар моделни ўқитишда кўп тилли маълумотлар улушини икки баравар оширган.
          Натижада ўзбек тилидаги матнларда грамматик хатолар сони сезиларли камайган.
        </p>
        <ul>
          <li>Кам ресурсли тилларда хатолар — 40 фоизгача кам;</li>
          <li>Жавоб тезлиги — ўртача 1,6 баравар юқори;</li>
          <li>Контекст ҳажми — 400 минг токенгача.</li>
        </ul>
        <blockquote>
          <p>
            «Биз ҳар бир фойдаланувчи ўз она тилида сифатли ёрдамчига эга бўлишини истаймиз», — деди
            компания вакили.
          </p>
        </blockquote>
        <AdSlot locale={locale} position="in-article" preview className="not-prose my-8" />
        <h3>Ишлаб чиқувчилар учун</h3>
        <p>
          API орқали модель <code>gpt-next</code> номи билан мавжуд. Оддий сўров намунаси:
        </p>
        <pre>
          <code>{`curl https://api.openai.com/v1/responses \\
  -H "Authorization: Bearer $OPENAI_API_KEY" \\
  -d '{"model": "gpt-next", "input": "Салом, дунё!"}'`}</code>
        </pre>
        <table>
          <thead>
            <tr>
              <th>Модель</th>
              <th>Ўзбек тили (аниқлик)</th>
              <th>Нархи (1 млн токен)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Олдинги версия</td>
              <td>71%</td>
              <td>$2,50</td>
            </tr>
            <tr>
              <td>Янги модель</td>
              <td>86%</td>
              <td>$2,00</td>
            </tr>
          </tbody>
        </table>
        <p>
          Янги модель ChatGPT’нинг пуллик тарифларида аллақачон мавжуд, бепул фойдаланувчиларга эса
          кейинги ҳафталарда очилади.
        </p>
      </>
    )
  }

  return (
    <>
      <p>
        OpenAI kompaniyasi seshanba kuni yangi til modelini taqdim etdi. Kompaniya maʼlumotiga
        koʻra, model oʻzbek, qozoq va tojik kabi <strong>kam resursli tillarda</strong> oldingi
        versiyasiga nisbatan ancha aniq ishlaydi. Yangilik haqida{' '}
        <a href="https://techcrunch.com">TechCrunch</a> birinchi boʻlib xabar berdi.
      </p>
      <h2>Nimalar oʻzgardi?</h2>
      <p>
        Ishlab chiquvchilar modelni oʻqitishda koʻp tilli maʼlumotlar ulushini ikki barobar
        oshirgan. Natijada oʻzbek tilidagi matnlarda grammatik xatolar soni sezilarli kamaygan.
      </p>
      <ul>
        <li>Kam resursli tillarda xatolar — 40 foizgacha kam;</li>
        <li>Javob tezligi — oʻrtacha 1,6 barobar yuqori;</li>
        <li>Kontekst hajmi — 400 ming tokengacha.</li>
      </ul>
      <blockquote>
        <p>
          “Biz har bir foydalanuvchi oʻz ona tilida sifatli yordamchiga ega boʻlishini istaymiz”, —
          dedi kompaniya vakili.
        </p>
      </blockquote>
      <AdSlot locale={locale} position="in-article" preview className="not-prose my-8" />
      <h3>Ishlab chiquvchilar uchun</h3>
      <p>
        API orqali model <code>gpt-next</code> nomi bilan mavjud. Oddiy soʻrov namunasi:
      </p>
      <pre>
        <code>{`curl https://api.openai.com/v1/responses \\
  -H "Authorization: Bearer $OPENAI_API_KEY" \\
  -d '{"model": "gpt-next", "input": "Salom, dunyo!"}'`}</code>
      </pre>
      <table>
        <thead>
          <tr>
            <th>Model</th>
            <th>Oʻzbek tili (aniqlik)</th>
            <th>Narxi (1 mln token)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Oldingi versiya</td>
            <td>71%</td>
            <td>$2,50</td>
          </tr>
          <tr>
            <td>Yangi model</td>
            <td>86%</td>
            <td>$2,00</td>
          </tr>
        </tbody>
      </table>
      <p>
        Yangi model ChatGPT’ning pullik tariflarida allaqachon mavjud, bepul foydalanuvchilarga esa
        keyingi haftalarda ochiladi.
      </p>
    </>
  )
}
