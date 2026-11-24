import React from "react";
import { Circle, Ellipse, Image, Line, Path, Polygon, Rect, Svg, Text, View } from "@react-pdf/renderer";
import { COMPANY } from "@/config/company";

/*
 * Letterhead repeated on every page (header, footer band, watermark), redrawn as vectors from
 * docs/pdf-template.jpeg so it stays sharp. Coordinates are in PDF points on an A4 page.
 */

const PAGE_W = 595.28;
const PAGE_H = 841.89;
export const BRAND_RED = "#71090D";
const DARK_GREY = "#3B3C40";

// Header geometry
const RULE_Y = 87.5;
const BAND_TOP = 81;
// Footer geometry
const FOOT_H = 29.3;
// Footer band sits flush with the bottom edge of the page.
const FOOT_TOP = PAGE_H - FOOT_H;
const FOOT_MID = FOOT_TOP + FOOT_H / 2;
const ICON_R = 10.5;

const asset = (base: string, src: string) => (src.startsWith("/") ? `${base}${src}` : src);

function GlobeIcon() {
  return (
    <Svg viewBox="0 0 24 24" style={{ width: 11, height: 11 }}>
      <Circle cx={12} cy={12} r={9} stroke="#FFFFFF" strokeWidth={1.6} fill="none" />
      <Ellipse cx={12} cy={12} rx={4} ry={9} stroke="#FFFFFF" strokeWidth={1.4} fill="none" />
      <Line x1={3} y1={12} x2={21} y2={12} stroke="#FFFFFF" strokeWidth={1.4} />
      <Line x1={4.5} y1={7.5} x2={19.5} y2={7.5} stroke="#FFFFFF" strokeWidth={1.2} />
      <Line x1={4.5} y1={16.5} x2={19.5} y2={16.5} stroke="#FFFFFF" strokeWidth={1.2} />
    </Svg>
  );
}

function PhoneIcon() {
  return (
    <Svg viewBox="0 0 24 24" style={{ width: 11, height: 11 }}>
      <Path
        fill="#FFFFFF"
        d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"
      />
    </Svg>
  );
}

function MailIcon() {
  return (
    <Svg viewBox="0 0 24 24" style={{ width: 11, height: 11 }}>
      <Rect x={3} y={5.5} width={18} height={13} rx={1.5} fill="#FFFFFF" />
      <Path d="M3.8 6.5 L12 13 L20.2 6.5" stroke={BRAND_RED} strokeWidth={1.6} fill="none" />
    </Svg>
  );
}

function FooterItem({ x, icon, text }: { x: number; icon: React.ReactNode; text: string }) {
  return (
    <View
      fixed
      style={{
        position: "absolute",
        left: x - ICON_R,
        top: FOOT_MID - ICON_R,
        flexDirection: "row",
        alignItems: "center",
      }}
    >
      <View
        style={{
          width: ICON_R * 2,
          height: ICON_R * 2,
          borderRadius: ICON_R,
          borderWidth: 0.9,
          borderColor: "#FFFFFF",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {icon}
      </View>
      <Text
        style={{
          marginLeft: 6.5,
          marginTop: 2,
          color: "#FFFFFF",
          fontSize: 8.5,
          fontFamily: "Helvetica",
          lineHeight: 1,
        }}
      >
        {text}
      </Text>
    </View>
  );
}

export function Letterhead({ base }: { base: string }) {
  return (
    <>
      {/* Steel-frame watermark (drawn first so content sits on top of it) */}
      {/* eslint-disable-next-line jsx-a11y/alt-text */}
      <Image
        fixed
        src={asset(base, COMPANY.assets.watermark)}
        style={{ position: "absolute", right: 0, bottom: FOOT_H + 2, width: 384.6, height: 242, opacity: 0.75 }}
      />

      {/* Header: logo mark | wordmark */}
      <View fixed style={{ position: "absolute", top: 24, left: 24, flexDirection: "row", alignItems: "center" }}>
        {/* eslint-disable-next-line jsx-a11y/alt-text */}
        <Image src={asset(base, COMPANY.assets.logoMark)} style={{ width: 49, height: 53 }} />
        <View style={{ width: 0.8, height: 54, backgroundColor: "#9A9A9A", marginLeft: 9, marginRight: 9 }} />
        <View style={{ width: 138 }}>
          <Text
            style={{ fontFamily: "Helvetica-Bold", fontSize: 24, letterSpacing: 2.2, color: BRAND_RED, lineHeight: 1 }}
          >
            POOJARY
          </Text>
          <Text
            style={{
              fontFamily: "Helvetica",
              fontSize: 9.2,
              letterSpacing: 4.05,
              color: "#555555",
              marginTop: 3,
              lineHeight: 1,
            }}
          >
            PREFAB PVT LTD
          </Text>
          <View style={{ height: 0.7, backgroundColor: "#A8A8A8", marginTop: 4.5, marginBottom: 4 }} />
          <Text
            style={{
              fontFamily: "Helvetica-Bold",
              fontSize: 4.9,
              letterSpacing: 0.42,
              color: BRAND_RED,
              lineHeight: 1,
            }}
          >
            {COMPANY.brandLine}
          </Text>
        </View>
      </View>

      {/* Header rule with the thicker angled band on the right */}
      <Svg fixed style={{ position: "absolute", top: 0, left: 0, width: PAGE_W, height: 100 }}>
        <Line x1={0} y1={RULE_Y} x2={500} y2={RULE_Y} stroke={BRAND_RED} strokeWidth={0.9} />
        <Polygon
          points={`${506},${BAND_TOP} ${PAGE_W},${BAND_TOP} ${PAGE_W},${RULE_Y + 0.45} ${499.5},${RULE_Y + 0.45}`}
          fill={BRAND_RED}
        />
      </Svg>

      {/* Footer bands */}
      <Svg fixed style={{ position: "absolute", top: 0, left: 0, width: PAGE_W, height: PAGE_H }}>
        <Polygon
          points={`0,${FOOT_TOP} 455,${FOOT_TOP} ${455 - FOOT_H * 0.966},${FOOT_TOP + FOOT_H} 0,${FOOT_TOP + FOOT_H}`}
          fill={BRAND_RED}
        />
        <Polygon
          points={`459,${FOOT_TOP} ${PAGE_W},${FOOT_TOP} ${PAGE_W},${FOOT_TOP + 7.6} ${459 - 7.6 * 0.966},${FOOT_TOP + 7.6}`}
          fill={DARK_GREY}
        />
        <Line x1={137} y1={FOOT_MID - 7} x2={137} y2={FOOT_MID + 7} stroke="#FFFFFF" strokeWidth={0.8} />
        <Line x1={264} y1={FOOT_MID - 7} x2={264} y2={FOOT_MID + 7} stroke="#FFFFFF" strokeWidth={0.8} />
      </Svg>
      <FooterItem x={41} icon={<GlobeIcon />} text={COMPANY.website} />
      <FooterItem x={164} icon={<PhoneIcon />} text={COMPANY.footerPhone} />
      <FooterItem x={292} icon={<MailIcon />} text={COMPANY.email} />
      <Text
        fixed
        style={{
          position: "absolute",
          right: 24,
          top: FOOT_TOP + 12,
          fontSize: 7.5,
          color: "#555555",
          fontFamily: "Helvetica",
        }}
        render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
      />
    </>
  );
}
