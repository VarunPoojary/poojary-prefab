import React from "react";
import { Text, View } from "@react-pdf/renderer";
import type { Styles } from "@react-pdf/renderer";

type Style = Styles[string];
import { parseText } from "@/lib/template";
import { s } from "./styles";

/** Renders text using the light markup from lib/template.parseText. */
export function RichText({ text, lead }: { text: string; lead?: string }) {
  const lines = parseText(text);
  return (
    <View>
      {lines.map((l, i) => {
        const prefix = i === 0 && lead ? <Text style={s.bold}>{lead} </Text> : null;
        switch (l.type) {
          case "gap":
            return <View key={i} style={s.gap} />;
          case "bullet":
            return (
              <View key={i} style={s.bulletRow} wrap={false}>
                <Text style={s.bulletMark}>•</Text>
                <Text style={s.flex1}>
                  {prefix}
                  {l.text}
                </Text>
              </View>
            );
          case "numbered":
            return (
              <View key={i} style={s.numberedRow} wrap={false}>
                <Text style={s.numberedMark}>{l.marker}</Text>
                <Text style={s.flex1}>
                  {prefix}
                  {l.text}
                </Text>
              </View>
            );
          default:
            return (
              <Text key={i} style={s.p}>
                {prefix}
                {l.text}
              </Text>
            );
        }
      })}
    </View>
  );
}

export interface CellProps {
  w: number | string;
  children?: React.ReactNode;
  style?: Style | Style[];
  textStyle?: Style | Style[];
}

/** Table cell; widths are percentages of the table width. */
export function Cell({ w, children, style, textStyle }: CellProps) {
  const extra = Array.isArray(style) ? style : style ? [style] : [];
  const tExtra = Array.isArray(textStyle) ? textStyle : textStyle ? [textStyle] : [];
  return (
    <View style={[s.cell, { width: typeof w === "number" ? `${w}%` : w }, ...extra]}>
      {typeof children === "string" || typeof children === "number" ? (
        <Text style={tExtra}>{children}</Text>
      ) : (
        children
      )}
    </View>
  );
}
