import {
  Circle,
  Document,
  Line,
  Page,
  Polyline,
  Rect,
  StyleSheet,
  Svg,
  Text,
  View,
} from "@react-pdf/renderer";
import type { DetailDossier, DetailField, DetailTable } from "@/lib/detailExport";
import { formatDetailTimestamp, getTrendPeak } from "@/lib/detailExport";
import { buildAverageWeekTrendPoints } from "@/lib/trendDownsampling";

const colors = {
  ink: "#16202a",
  muted: "#66717d",
  line: "#dce2e7",
  panel: "#f4f7f9",
  primary: "#0f6e78",
  primarySoft: "#e5f2f3",
  weekend: "#eef1f3",
  warning: "#9a5b11",
  critical: "#b42318",
  good: "#18794e",
};

const styles = StyleSheet.create({
  page: { paddingTop: 34, paddingHorizontal: 34, paddingBottom: 42, fontFamily: "Helvetica", fontSize: 8.5, color: colors.ink },
  eyebrow: { fontSize: 7, color: colors.primary, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 5 },
  title: { fontSize: 21, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  subtitle: { fontSize: 8.5, color: colors.muted, marginBottom: 10 },
  summary: { fontSize: 9.5, lineHeight: 1.45, padding: 10, backgroundColor: colors.primarySoft, borderRadius: 4, marginBottom: 12 },
  kpiGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 12 },
  kpi: { width: "23.6%", minHeight: 42, padding: 7, backgroundColor: colors.panel, borderRadius: 4 },
  kpiLabel: { fontSize: 6.5, color: colors.muted, textTransform: "uppercase", letterSpacing: 0.4 },
  kpiValue: { fontSize: 11, fontFamily: "Helvetica-Bold", marginTop: 3 },
  kpiHint: { fontSize: 6.5, color: colors.muted, marginTop: 2 },
  section: { marginBottom: 12 },
  sectionTitleRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 },
  sectionMarker: { width: 3, height: 12, backgroundColor: colors.primary, borderRadius: 2 },
  sectionTitle: { fontSize: 11, fontFamily: "Helvetica-Bold" },
  sectionDescription: { color: colors.muted, lineHeight: 1.4, marginBottom: 6 },
  fieldGrid: { flexDirection: "row", flexWrap: "wrap", gap: 5 },
  field: { width: "32.2%", padding: 6, backgroundColor: colors.panel, borderRadius: 3 },
  fieldLabel: { fontSize: 6.2, color: colors.muted, textTransform: "uppercase" },
  fieldValue: { fontSize: 8, marginTop: 2, lineHeight: 1.25 },
  note: { marginTop: 6, color: colors.muted, fontSize: 7.5, lineHeight: 1.4 },
  table: { borderTopWidth: 1, borderLeftWidth: 1, borderColor: colors.line },
  tableRow: { flexDirection: "row" },
  tableHeader: { backgroundColor: "#e8edf0" },
  tableCell: { flex: 1, paddingVertical: 4, paddingHorizontal: 4, borderRightWidth: 1, borderBottomWidth: 1, borderColor: colors.line, fontSize: 6.5 },
  tableCellHeader: { fontFamily: "Helvetica-Bold", color: colors.muted },
  trendMeta: { flexDirection: "row", justifyContent: "space-between", color: colors.muted, fontSize: 7, marginBottom: 5 },
  footer: { position: "absolute", left: 34, right: 34, bottom: 18, flexDirection: "row", justifyContent: "space-between", color: colors.muted, fontSize: 7 },
});

function PdfFields({ fields }: { fields: DetailField[] }) {
  return (
    <View style={styles.fieldGrid}>
      {fields.map((field) => (
        <View key={field.label} style={styles.field}>
          <Text style={styles.fieldLabel}>{field.label}</Text>
          <Text style={styles.fieldValue}>{field.value || "—"}</Text>
        </View>
      ))}
    </View>
  );
}

function PdfTable({ table }: { table: DetailTable }) {
  const rows = table.rows.slice(0, table.maxRows ?? 30);
  return (
    <View style={styles.table}>
      <View style={[styles.tableRow, styles.tableHeader]} fixed>
        {table.headers.map((header) => <Text key={header} style={[styles.tableCell, styles.tableCellHeader]}>{header}</Text>)}
      </View>
      {rows.map((row, rowIndex) => (
        <View key={`${rowIndex}-${row.join("-")}`} style={styles.tableRow} wrap={false}>
          {table.headers.map((header, columnIndex) => (
            <Text key={`${header}-${columnIndex}`} style={styles.tableCell}>{row[columnIndex] || "—"}</Text>
          ))}
        </View>
      ))}
      {table.rows.length > rows.length && <Text style={styles.note}>Weitere {table.rows.length - rows.length} Datensätze sind in dieser kompakten PDF-Fassung nicht abgebildet.</Text>}
    </View>
  );
}

function TrendVector({ dossier, view = "timeline" }: { dossier: DetailDossier; view?: "timeline" | "average-week" }) {
  const trend = dossier.trend;
  if (!trend?.points.length) return null;
  const cpuCapacityMHz = trend.cpuCapacityMHz && trend.cpuCapacityMHz > 0 ? trend.cpuCapacityMHz : null;
  const points = view === "average-week"
    ? buildAverageWeekTrendPoints(trend.points.map((point) => ({
      timestampMs: point.timestampUtc,
      cpu: point.cpuDemandMHz,
      cpuPeak: point.cpuDemandMaxMHz,
      secondary: point.secondaryValue,
    }))).map((point) => ({
      timestampUtc: point.timestampMs,
      cpuDemandMHz: point.cpu,
      cpuDemandMaxMHz: point.cpuPeak,
      secondaryValue: point.secondary,
    }))
    : trend.points;
  const toPercent = (value: number | null) => value === null || cpuCapacityMHz === null ? null : (value / cpuCapacityMHz) * 100;
  const formatPercent = (value: number | null) => value === null ? "—" : `${value.toLocaleString("de-DE", { maximumFractionDigits: 1 })} %`;
  const values = points.map((point) => toPercent(point.cpuDemandMHz) ?? 0);
  // Eine 0–100-%-Skala macht die beiden Ansichten direkt vergleichbar; echte
  // Überlast bleibt sichtbar, statt am oberen Rand abgeschnitten zu werden.
  const maximum = Math.max(...values, 100);
  const width = 520;
  const height = 150;
  const plotLeft = 34;
  const plotTop = 14;
  const plotWidth = width - plotLeft - 10;
  const plotHeight = height - plotTop - 28;
  const xFor = (index: number) => plotLeft + (index / Math.max(points.length - 1, 1)) * plotWidth;
  const yFor = (value: number) => plotTop + plotHeight - (value / maximum) * plotHeight;
  const polyline = points.map((point, index) => `${xFor(index)},${yFor(toPercent(point.cpuDemandMHz) ?? 0)}`).join(" ");
  const peak = getTrendPeak(points);
  const peakIndex = peak ? points.indexOf(peak) : -1;
  const dayStarts = points.reduce<number[]>((indices, point, index) => {
    if (index === 0 || new Date(point.timestampUtc).getDate() !== new Date(points[index - 1].timestampUtc).getDate()) indices.push(index);
    return indices;
  }, []);

  return (
    <View style={styles.section} wrap={false}>
      <View style={styles.sectionTitleRow}><View style={styles.sectionMarker} /><Text style={styles.sectionTitle}>{view === "average-week" ? `${trend.title} · Durchschnittliche Woche` : trend.title}</Text></View>
      <View style={styles.trendMeta}>
        <Text>{cpuCapacityMHz === null ? "CPU-Kapazität fehlt · Prozentansicht nicht berechenbar" : view === "average-week" ? "CPU-Auslastung in % · Mittelwert je Wochenstunde · Wochenende grau markiert" : "CPU-Auslastung in % · stündliche Werte · Wochenende grau markiert"}</Text>
        <Text>{trend.importedAt ? `Import ${new Date(trend.importedAt).toLocaleDateString("de-DE")}` : ""}</Text>
      </View>
      {cpuCapacityMHz === null ? <Text style={styles.note}>Für diese VM ist keine konfigurierte CPU-Kapazität verfügbar. Die Auslastung kann deshalb nicht als Prozentwert dargestellt werden.</Text> : <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
        {dayStarts.map((start, dayIndex) => {
          const end = dayStarts[dayIndex + 1] ?? points.length - 1;
          const isWeekend = [0, 6].includes(new Date(points[start].timestampUtc).getDay());
          return isWeekend ? <Rect key={start} x={xFor(start)} y={plotTop} width={Math.max(xFor(end) - xFor(start), 1)} height={plotHeight} fill={colors.weekend} /> : null;
        })}
        {[0, 0.5, 1].map((ratio) => (
          <Line key={ratio} x1={plotLeft} x2={plotLeft + plotWidth} y1={plotTop + plotHeight * ratio} y2={plotTop + plotHeight * ratio} stroke={colors.line} strokeWidth={0.7} />
        ))}
        <Polyline points={polyline} fill="none" stroke={colors.primary} strokeWidth={1.8} />
        {peak && peakIndex >= 0 && (
          <>
            <Circle cx={xFor(peakIndex)} cy={yFor(toPercent(peak.cpuDemandMHz) ?? 0)} r={3.2} fill={colors.critical} />
            <Text x={Math.min(xFor(peakIndex) + 5, width - 94)} y={Math.max(yFor(toPercent(peak.cpuDemandMHz) ?? 0) - 5, 9)} style={{ fontSize: 6.5, fill: colors.critical }}>
              Peak {formatPercent(toPercent(peak.cpuDemandMHz))}
            </Text>
          </>
        )}
        <Text x={2} y={plotTop + 3} style={{ fontSize: 6, fill: colors.muted }}>{formatPercent(maximum)}</Text>
        <Text x={20} y={plotTop + plotHeight + 2} style={{ fontSize: 6, fill: colors.muted }}>0 %</Text>
        {dayStarts.map((index) => (
          <Text key={index} x={xFor(index)} y={height - 8} style={{ fontSize: 6, fill: colors.muted }}>
            {view === "average-week"
              ? ["MO", "DI", "MI", "DO", "FR", "SA", "SO"][(new Date(points[index].timestampUtc).getDay() + 6) % 7]
              : new Date(points[index].timestampUtc).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}
          </Text>
        ))}
      </Svg>}
      {peak && cpuCapacityMHz !== null && <Text style={styles.note}>{view === "average-week" ? "Höchster Wochenstunden-Peak" : "Höchster gemessener CPU-Peak"}: {formatPercent(toPercent(peak.cpuDemandMHz))} am {view === "average-week" ? new Date(peak.timestampUtc).toLocaleString("de-DE", { weekday: "long", hour: "2-digit", minute: "2-digit" }) : formatDetailTimestamp(peak.timestampUtc)}.</Text>}
    </View>
  );
}

export function SystemDossierPdf({ dossier, pseudonymized }: { dossier: DetailDossier; pseudonymized: boolean }) {
  return (
    <Document title={`${dossier.kind} ${dossier.title}`} author="RVTools Analyzer - Philipp Asanger" subject="Systemdatenblatt">
      <Page size="A4" style={styles.page} wrap>
        <Text style={styles.eyebrow}>{dossier.kind}-Systemdatenblatt {pseudonymized ? "· pseudonymisiert" : ""}</Text>
        <Text style={styles.title}>{dossier.title}</Text>
        {dossier.subtitle && <Text style={styles.subtitle}>{dossier.subtitle}</Text>}
        <Text style={styles.summary}>{dossier.summary}</Text>
        <View style={styles.kpiGrid}>
          {dossier.kpis.map((kpi) => (
            <View key={kpi.label} style={styles.kpi}>
              <Text style={styles.kpiLabel}>{kpi.label}</Text>
              <Text style={[styles.kpiValue, kpi.tone === "critical" ? { color: colors.critical } : kpi.tone === "warning" ? { color: colors.warning } : kpi.tone === "good" ? { color: colors.good } : {}]}>{kpi.value}</Text>
              {kpi.hint && <Text style={styles.kpiHint}>{kpi.hint}</Text>}
            </View>
          ))}
        </View>
        <TrendVector dossier={dossier} />
        <TrendVector dossier={dossier} view="average-week" />
        {dossier.sections.map((section) => (
          <View key={section.title} style={styles.section}>
            <View style={styles.sectionTitleRow} minPresenceAhead={60}>
              <View style={styles.sectionMarker} />
              <Text style={styles.sectionTitle}>{section.title}</Text>
            </View>
            {section.description && <Text style={styles.sectionDescription}>{section.description}</Text>}
            {section.fields?.length ? <PdfFields fields={section.fields} /> : null}
            {section.table ? <PdfTable table={section.table} /> : null}
            {section.note && <Text style={styles.note}>{section.note}</Text>}
          </View>
        ))}
        <View style={styles.footer} fixed>
          <Text>RVTools Analyzer - by Philipp Asanger</Text>
          <Text render={({ pageNumber, totalPages }) => `Seite ${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
