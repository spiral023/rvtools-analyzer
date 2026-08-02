import {
  AlertOctagon,
  AlertTriangle,
  ArrowDown,
  Ban,
  Cable,
  CheckCircle2,
  Database,
  Fingerprint,
  Radar,
  Server,
  type LucideIcon,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface DataSource {
  label: string;
  detail: string;
}

const DATA_SOURCES: DataSource[] = [
  {
    label: "Eramon · Switch-Interfaces",
    detail: "Physisches Port-Inventar der Switches: Beschreibung, Bandbreite, Link-Status.",
  },
  {
    label: "Eramon · L2/MAC-Tabelle",
    detail: "Welche MAC- und IP-Adresse der Switch an welchem Port und in welchem VLAN gelernt hat.",
  },
  {
    label: "CDP-Export",
    detail: "Von ESXi gemeldete Nachbarschaftsdaten: an welchem Switch-Port ein physischer Adapter hängt.",
  },
  {
    label: "RVTools",
    detail: "vCenter-Inventar der ESXi-Hosts – der fachliche Soll-Zustand für Namen und Cluster.",
  },
  {
    label: "Tech-Info",
    detail: "Lokale technische Dokumentation zu Servern: Servertyp, Abteilung, Zuständigkeit.",
  },
  {
    label: "IPAM (Infoblox)",
    detail: "IP-Adressinventar mit Belegungsstatus, DNS-Namen und Discovery-Historie.",
  },
];

interface CheckExplainer {
  icon: LucideIcon;
  title: string;
  question: string;
  required: string;
  optional: string | null;
  meaning: string;
  firstStep: string;
}

const CHECK_EXPLAINERS: CheckExplainer[] = [
  {
    icon: Cable,
    title: "Switch-Port-Zuordnungen",
    question: "Stimmen Portbeschriftung, Link-Status und CDP-Nachbar überein?",
    required: "Eramon Interface",
    optional: "CDP, RVTools, Tech-Info, IPAM",
    meaning: "Ein Befund heißt: Beschriftung und CDP widersprechen sich, der Link-Status passt nicht zur erwarteten Verbindung, oder es lässt sich kein Ziel ermitteln.",
    firstStep: "Bei einem Widerspruch Beschriftung oder Dokumentation korrigieren; ohne Ziel den Port physisch nachverfolgen.",
  },
  {
    icon: Server,
    title: "Host-Datenqualität",
    question: "Sind alle ESXi-Hosts in Tech-Info und IPAM dokumentiert?",
    required: "RVTools",
    optional: "Tech-Info, IPAM",
    meaning: "Ein Befund heißt: Ein Host aus RVTools fehlt in Tech-Info oder IPAM – oder umgekehrt.",
    firstStep: "Fehlenden Eintrag ergänzen oder abweichende Schreibweise des Hostnamens angleichen.",
  },
  {
    icon: Fingerprint,
    title: "ESXi-MAC-Abgleich",
    question: "Werden die Host-Adapter am erwarteten Switch-Port gesehen?",
    required: "CDP, Eramon L2",
    optional: null,
    meaning: "Ein Befund heißt: Die Adapter-MAC wurde nicht gelernt (Zu prüfen) oder an einem anderen Port gelernt, als CDP meldet (Kritisch).",
    firstStep: "Bei „fehlt“ zuerst die Import-Zeitpunkte vergleichen; bei Abweichung vorrangig die Verkabelung vor Ort prüfen.",
  },
  {
    icon: Radar,
    title: "Unbekannte Geräte",
    question: "Welche Geräte lassen sich weder CDP noch IPAM zuordnen?",
    required: "Eramon L2",
    optional: "CDP, IPAM",
    meaning: "Klassifiziert jede gelernte MAC als ESXi (CDP), IPAM-bekannt oder Unbekannt/Fremd.",
    firstStep: "„Unbekannt/Fremd“ vor Ort verifizieren – erst danach in IPAM oder Dokumentation nachtragen.",
  },
];

interface StatusExplainer {
  icon: LucideIcon;
  label: string;
  description: string;
  edgeClass: string;
  textClass: string;
}

const ROW_STATUS: StatusExplainer[] = [
  {
    icon: AlertOctagon,
    label: "Kritisch",
    description: "Widerspruch zwischen den Quellen oder zur erwarteten Topologie. Zuerst bearbeiten.",
    edgeClass: "border-l-destructive",
    textClass: "text-destructive",
  },
  {
    icon: AlertTriangle,
    label: "Zu prüfen",
    description: "Unbekannte Zuordnung oder Datenlücke ohne direkten Widerspruch.",
    edgeClass: "border-l-warning",
    textClass: "text-warning",
  },
  {
    icon: CheckCircle2,
    label: "Bestanden",
    description: "Zuordnung bestätigt, kein Konflikt erkannt.",
    edgeClass: "border-l-success",
    textClass: "text-success",
  },
];

const READINESS_STATES: StatusExplainer[] = [
  {
    icon: CheckCircle2,
    label: "Bereit",
    description: "Alle Quellen dieser Prüfung – Pflicht und optional – sind importiert.",
    edgeClass: "border-l-success",
    textClass: "text-success",
  },
  {
    icon: AlertTriangle,
    label: "Eingeschränkt",
    description: "Pflichtquellen vorhanden, eine optionale Quelle fehlt. Ergebnisse bleiben gültig, aber weniger abgesichert.",
    edgeClass: "border-l-warning",
    textClass: "text-warning",
  },
  {
    icon: Ban,
    label: "Nicht ausführbar",
    description: "Eine Pflichtquelle fehlt komplett. Import nachholen, dann erneut versuchen.",
    edgeClass: "border-l-muted-foreground/35",
    textClass: "text-muted-foreground",
  },
];

interface FindingExample {
  severity: "Kritisch" | "Zu prüfen";
  name: string;
  cause: string;
  action: string;
}

interface FindingGroup {
  icon: LucideIcon;
  title: string;
  items: FindingExample[];
}

const FINDING_GROUPS: FindingGroup[] = [
  {
    icon: Cable,
    title: "Switch-Ports",
    items: [
      {
        severity: "Kritisch",
        name: "Beschriftungs-Konflikt",
        cause: "Die Port-Beschreibung nennt einen anderen Host, als CDP tatsächlich meldet – meist nach einem Host- oder Kabeltausch ohne Doku-Update.",
        action: "Beschreibung am Switch oder die Dokumentation korrigieren.",
      },
      {
        severity: "Kritisch",
        name: "Status-Konflikt",
        cause: "Der gemeldete Link-Status widerspricht dem, was CDP oder RVTools erwarten lassen.",
        action: "Kabel, SFP und Port-Konfiguration vor Ort prüfen.",
      },
      {
        severity: "Zu prüfen",
        name: "Unbekannt",
        cause: "Weder CDP-Nachbar noch Dokumentation liefern ein Ziel für diesen Port.",
        action: "Port physisch nachverfolgen und Beschriftung ergänzen.",
      },
    ],
  },
  {
    icon: Server,
    title: "Host-Daten",
    items: [
      {
        severity: "Zu prüfen",
        name: "Datenlücke",
        cause: "Ein Host aus RVTools fehlt in Tech-Info oder IPAM – häufig, weil ein neuer oder umbenannter Host nicht in allen Systemen nachgezogen wurde.",
        action: "Fehlenden Eintrag ergänzen oder Schreibweise des Hostnamens angleichen.",
      },
    ],
  },
  {
    icon: Fingerprint,
    title: "MAC-Abgleich",
    items: [
      {
        severity: "Zu prüfen",
        name: "Fehlt in L2",
        cause: "Die Adapter-MAC wurde nicht in der Eramon-L2-Tabelle gelernt – oft durch unterschiedliche Erfassungszeitpunkte zwischen CDP-Export und Eramon-Import, oder weil der Port zum Import-Zeitpunkt inaktiv war.",
        action: "Zeitstempel der beiden Importe vergleichen, bei Bedarf neu importieren.",
      },
      {
        severity: "Kritisch",
        name: "Topologie-Abweichung",
        cause: "Die MAC wurde an einem anderen Switch-Port gelernt, als CDP meldet.",
        action: "Verkabelung vor Ort prüfen – dieser Befund hat Vorrang.",
      },
    ],
  },
  {
    icon: Radar,
    title: "Netz-Discovery",
    items: [
      {
        severity: "Zu prüfen",
        name: "Unbekannt/Fremd",
        cause: "Weder CDP noch IPAM erklären die gelernte MAC – das kann ein Fremdgerät (Drucker, Access Point, Client) oder eine Datenlücke im IPAM sein.",
        action: "Gerät vor Ort verifizieren, erst danach in IPAM oder Dokumentation nachtragen. Keine automatische Sicherheitsbewertung.",
      },
    ],
  },
];

const WORKFLOW_STEPS: string[] = [
  "Datenbasis oben prüfen: grüner Rand = importiert, grauer Rand = fehlt. Ohne Pflichtquelle bleibt eine Prüfung „Nicht ausführbar“.",
  "Mit dem Filter „Handlungsbedarf“ beginnen, damit bestandene Punkte nicht ablenken.",
  "Kritische Befunde zuerst klären, danach „Zu prüfen“ – „Nächsten Befund prüfen“ springt automatisch zum dringendsten Bereich.",
  "Dem Prüfpfad folgen: Switch-Ports → Host-Daten → MAC-Abgleich → Netz-Discovery. Eine Lücke am Anfang erzeugt oft Folgebefunde weiter rechts.",
  "Die Spalte „Auffälligkeit“ lesen – sie benennt die konkrete Abweichung, nicht nur, dass eine besteht.",
  "Ursache im jeweiligen Quellsystem klären und dort korrigieren. Die Kontrolle selbst ist rein lesend.",
  "Betroffenen Export neu einspielen und mit „Erneut versuchen“ aktualisieren.",
];

function StatusTile({ item }: { item: StatusExplainer }) {
  return (
    <div className={cn("rounded-lg border border-l-4 bg-card p-3", item.edgeClass)}>
      <div className={cn("flex items-center gap-1.5 text-sm font-semibold", item.textClass)}>
        <item.icon aria-hidden="true" className="h-4 w-4 shrink-0" />
        {item.label}
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">{item.description}</p>
    </div>
  );
}

export function NetworkAuditHelp() {
  return (
    <div className="space-y-8">
      <section aria-labelledby="audit-help-intro-heading" className="space-y-2">
        <h2 id="audit-help-intro-heading" className="text-lg font-semibold tracking-tight">
          Wie die Netzwerk-Kontrolle arbeitet
        </h2>
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
          Die Kontrolle vergleicht, was deine Switches, ESXi-Hosts und Verwaltungssysteme jeweils über
          dieselbe physische Verbindung berichten. Stimmen die Angaben überein, gilt der Punkt als
          bestätigt. Weichen sie ab oder fehlt eine Angabe ganz, entsteht ein Befund – etwas, das
          jemand sich ansieht, kein automatisch behobener Fehler. Die Ansicht selbst ist rein lesend;
          Korrekturen erfolgen immer in den Quellsystemen.
        </p>
      </section>

      <section aria-labelledby="audit-help-sources-heading" className="space-y-3">
        <div className="space-y-1">
          <h2 id="audit-help-sources-heading" className="text-lg font-semibold tracking-tight">
            Woher die Daten kommen
          </h2>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Sechs Importe fließen in die vier Prüfungen ein. Je vollständiger die Datenbasis, desto
            belastbarer das Ergebnis.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {DATA_SOURCES.map((source) => (
            <div key={source.label} className="flex gap-2.5 rounded-lg border bg-card p-3">
              <Database aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="space-y-1">
                <p className="text-sm font-semibold leading-snug">{source.label}</p>
                <p className="text-xs leading-relaxed text-muted-foreground">{source.detail}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <ArrowDown aria-hidden="true" className="h-4 w-4" />
          fließen in die vier Prüfungen ein
        </div>
      </section>

      <section aria-labelledby="audit-help-checks-heading" className="space-y-3">
        <h2 id="audit-help-checks-heading" className="text-lg font-semibold tracking-tight">
          Die vier Prüfungen im Einzelnen
        </h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {CHECK_EXPLAINERS.map((check) => (
            <Card key={check.title}>
              <CardHeader className="space-y-2 p-4 pb-2">
                <div className="flex items-center gap-2">
                  <check.icon aria-hidden="true" className="h-4 w-4 shrink-0 text-primary" />
                  <h3 className="text-sm font-semibold tracking-tight">{check.title}</h3>
                </div>
                <p className="text-sm leading-relaxed text-muted-foreground">{check.question}</p>
              </CardHeader>
              <CardContent className="space-y-2.5 p-4 pt-2 text-xs">
                <p>
                  <span className="font-semibold text-foreground">Pflichtquelle:</span>{" "}
                  <span className="text-muted-foreground">{check.required}</span>
                  {check.optional && (
                    <>
                      {" · "}
                      <span className="font-semibold text-foreground">optional:</span>{" "}
                      <span className="text-muted-foreground">{check.optional}</span>
                    </>
                  )}
                </p>
                <p className="leading-relaxed text-muted-foreground">{check.meaning}</p>
                <p className="leading-relaxed text-muted-foreground">
                  <span className="font-semibold text-foreground">Erster Schritt: </span>
                  {check.firstStep}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section aria-labelledby="audit-help-status-heading" className="space-y-3">
        <div className="space-y-1">
          <h2 id="audit-help-status-heading" className="text-lg font-semibold tracking-tight">
            Ergebnisfarben lesen
          </h2>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Zwei unabhängige Ampeln: der Status je Zeile und die Verfügbarkeit der ganzen Prüfung.
          </p>
        </div>
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Status pro Zeile/Befund
          </p>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            {ROW_STATUS.map((item) => (
              <StatusTile key={item.label} item={item} />
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Verfügbarkeit der Prüfung (abhängig von der Datenbasis)
          </p>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            {READINESS_STATES.map((item) => (
              <StatusTile key={item.label} item={item} />
            ))}
          </div>
        </div>
      </section>

      <section aria-labelledby="audit-help-workflow-heading" className="space-y-3">
        <h2 id="audit-help-workflow-heading" className="text-lg font-semibold tracking-tight">
          Empfohlener Arbeitsablauf
        </h2>
        <ol className="space-y-3">
          {WORKFLOW_STEPS.map((step, index) => (
            <li key={step} className="flex gap-3 rounded-lg border bg-card p-3">
              <span className="font-mono text-xs font-bold tabular-nums text-muted-foreground">
                {String(index + 1).padStart(2, "0")}
              </span>
              <p className="text-sm leading-relaxed">{step}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="audit-help-findings-heading" className="space-y-3">
        <div className="space-y-1">
          <h2 id="audit-help-findings-heading" className="text-lg font-semibold tracking-tight">
            Typische Auffälligkeiten und wie man sie einordnet
          </h2>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Konkrete Ursachen für die häufigsten Befundarten – und die naheliegende erste Maßnahme.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {FINDING_GROUPS.map((group) => (
            <Card key={group.title}>
              <CardHeader className="flex-row items-center gap-2 space-y-0 p-4 pb-2">
                <group.icon aria-hidden="true" className="h-4 w-4 shrink-0 text-primary" />
                <h3 className="text-sm font-semibold tracking-tight">{group.title}</h3>
              </CardHeader>
              <CardContent className="space-y-3 p-4 pt-2">
                {group.items.map((item) => (
                  <div key={item.name} className="space-y-1 border-t pt-3 first:border-t-0 first:pt-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant="outline"
                        className={item.severity === "Kritisch"
                          ? "border-destructive/40 text-destructive"
                          : "border-warning/40 text-warning"}
                      >
                        {item.severity}
                      </Badge>
                      <span className="text-sm font-semibold">{item.name}</span>
                    </div>
                    <p className="text-xs leading-relaxed text-muted-foreground">{item.cause}</p>
                    <p className="text-xs leading-relaxed">
                      <span className="font-semibold text-foreground">Maßnahme: </span>
                      <span className="text-muted-foreground">{item.action}</span>
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section aria-labelledby="audit-help-limits-heading">
        <Alert className="border-warning/45 bg-warning/5">
          <AlertTriangle aria-hidden="true" className="h-4 w-4 text-warning" />
          <AlertTitle id="audit-help-limits-heading">Grenzen der Kontrolle</AlertTitle>
          <AlertDescription>
            <ul className="mt-1 list-disc space-y-1.5 pl-4 text-sm">
              <li>
                Eramon-L2-Daten sind eine Momentaufnahme zum Import-Zeitpunkt, keine Live-Sicht auf
                das Netz.
              </li>
              <li>
                Bei mehreren Importen zählt je Schlüssel (Switch+Port bzw. Switch+Interface+MAC+VLAN)
                immer der neueste Stand – ältere Importe werden verworfen.
              </li>
              <li>
                Ein fehlender DNS-Name oder Kommentar ist für sich genommen kein Fehler, sondern
                erschwert nur die Zuordnung.
              </li>
              <li>
                Die Kontrolle zeigt nur an. Korrekturen erfolgen in den Quellsystemen (Eramon,
                CDP-Export, RVTools, Tech-Info, IPAM) und werden erst nach einem erneuten Import
                sichtbar.
              </li>
            </ul>
          </AlertDescription>
        </Alert>
      </section>
    </div>
  );
}
