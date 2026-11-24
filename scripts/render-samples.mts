/* Renders the example presets to PDF files for visual checks: npm run render:samples -- [outDir] */
import path from "node:path";
import fs from "node:fs";
import { createElement } from "react";
import { renderToFile } from "@react-pdf/renderer";
import { QuotationDocument } from "../components/pdf/QuotationDocument";
import { PRESETS } from "../lib/defaults";

const out = path.resolve(process.argv[2] ?? "out");
fs.mkdirSync(out, { recursive: true });
const base = path.resolve("public");
for (const p of PRESETS) {
  const file = path.join(out, `${p.key}.pdf`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await renderToFile(createElement(QuotationDocument, { q: p.create(), assetBase: base }) as any, file);
  console.log("wrote", file);
}
