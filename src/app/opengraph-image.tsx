import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { SITE } from "@/config/site";

export const alt = `${SITE.name} — ${SITE.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** The social-sharing card: brand mark, tagline and the proposition, in the site's sky palette. */
export default async function OpenGraphImage() {
  const mark = await readFile(path.join(process.cwd(), "public/assets/logo/tentact-block-512.png"));
  const markSrc = `data:image/png;base64,${mark.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 72px",
          background: "linear-gradient(180deg, #6a80c6 0%, #adbbe6 48%, #eceef3 100%)",
          color: "#0e0e0f",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <img src={markSrc} width={72} height={72} alt="" style={{ borderRadius: 18 }} />
          <div style={{ display: "flex", fontSize: 34, fontWeight: 700, color: "#ffffff", letterSpacing: -1 }}>The Tentact</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <div style={{ display: "flex", fontSize: 84, fontWeight: 700, lineHeight: 1, letterSpacing: -4, color: "#ffffff" }}>
            Sales data for people who sell.
          </div>
          <div style={{ display: "flex", fontSize: 32, lineHeight: 1.3, color: "#0e0e0f", maxWidth: 980 }}>
            420+ million verified data, filtered to your ideal customer profile.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: 24,
            color: "#3a3a3e",
          }}
        >
          <div style={{ display: "flex" }}>Verified emails · Direct dials · ICP-based lists</div>
          <div style={{ display: "flex", padding: "10px 22px", borderRadius: 999, background: "#ff4a1c", color: "#ffffff", fontWeight: 700 }}>
            {SITE.salesEmail}
          </div>
        </div>
      </div>
    ),
    size,
  );
}
