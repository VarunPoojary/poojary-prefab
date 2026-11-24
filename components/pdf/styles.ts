import { Font, StyleSheet } from "@react-pdf/renderer";

let registeredFor: string | null = null;

/**
 * Registers fonts once. `base` is the origin (browser) or absolute path to /public (node scripts).
 * Carlito is metric-compatible with Calibri (used in the Word letterhead & tables);
 * the built-in Helvetica matches Arial used for body text.
 */
export function registerFonts(base: string) {
  if (registeredFor === base) return;
  registeredFor = base;
  Font.register({
    family: "Carlito",
    fonts: [
      { src: `${base}/fonts/Carlito-Regular.ttf` },
      { src: `${base}/fonts/Carlito-Bold.ttf`, fontWeight: "bold" },
      { src: `${base}/fonts/Carlito-Italic.ttf`, fontStyle: "italic" },
      { src: `${base}/fonts/Carlito-BoldItalic.ttf`, fontWeight: "bold", fontStyle: "italic" },
    ],
  });
  Font.registerHyphenationCallback((word) => [word]);
}

export const RED = "#C0392B";
export const BLUE = "#1F4E9A";
export const BORDER = "#555555";
export const SHADE = "#F2F2F2";

export const s = StyleSheet.create({
  page: {
    paddingTop: 108,
    paddingBottom: 52,
    paddingHorizontal: 50,
    fontFamily: "Helvetica",
    fontSize: 10.5,
    lineHeight: 1.35,
    color: "#111111",
  },

  p: { textAlign: "justify", marginBottom: 7 },
  gap: { height: 6 },
  bulletRow: { flexDirection: "row", marginBottom: 3, paddingLeft: 14 },
  bulletMark: { width: 12 },
  numberedRow: { flexDirection: "row", marginBottom: 4, paddingLeft: 4 },
  numberedMark: { width: 20 },
  flex1: { flex: 1, textAlign: "justify" },
  bold: { fontFamily: "Helvetica-Bold" },
  sectionTitle: { fontFamily: "Helvetica-Bold", marginTop: 8, marginBottom: 6 },
  underlineTitle: { textDecoration: "underline", marginTop: 10, marginBottom: 6 },
  block: { marginBottom: 8 },

  // Left border lives on rows (not the table) so split tables don't leave a dangling border.
  table: { borderTopWidth: 1, borderColor: BORDER },
  row: { flexDirection: "row", borderLeftWidth: 1, borderColor: BORDER },
  cell: {
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: BORDER,
    paddingVertical: 3,
    paddingHorizontal: 4,
  },
  tableFont: { fontFamily: "Carlito", fontSize: 10, lineHeight: 1.2 },
  th: { fontFamily: "Carlito", fontWeight: "bold" },
  right: { textAlign: "right" },
  center: { textAlign: "center" },
  shaded: { backgroundColor: SHADE },
});
