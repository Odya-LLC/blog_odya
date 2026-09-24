import { type JsonLdObject, serializeJsonLd } from './json-ld'

/** `<script type="application/ld+json">` — har bir obyekt alohida skriptda (`null` o'tkazib yuboriladi). */
export function JsonLd({ data }: { data: Array<JsonLdObject | null | undefined> }) {
  return (
    <>
      {data.map((item, index) =>
        item ? (
          <script
            key={`${String(item['@type'])}-${index}`}
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: serializeJsonLd(item) }}
          />
        ) : null,
      )}
    </>
  )
}
