interface JsonLdProps {
  /** A schema.org object, or a `@graph` of them. */
  data: Record<string, unknown>;
}

/** Emits structured data. `<` is escaped so page content can never terminate the script early. */
export function JsonLd({ data }: JsonLdProps) {
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
