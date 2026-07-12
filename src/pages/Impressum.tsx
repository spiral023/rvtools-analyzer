import {
  CircleUserRound,
  Database,
  Mail,
  MapPin,
  ShieldCheck,
  Workflow,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

const privacyFacts = [
  {
    icon: Workflow,
    title: "Verarbeitung im Browser",
    description:
      "RVTools-Dateien werden clientseitig verarbeitet. Das Parsing läuft in einem Web Worker und blockiert die Oberfläche nicht.",
  },
  {
    icon: Database,
    title: "Lokaler Browserspeicher",
    description:
      "Die aufbereiteten Daten werden in IndexedDB unter der Domain dieser Anwendung gespeichert und bleiben auf diesem Gerät.",
  },
  {
    icon: ShieldCheck,
    title: "Kein eigenes Daten-Backend",
    description:
      "Die Anwendung überträgt importierte RVTools-Inhalte nicht an ein eigenes Backend. Sie können die Daten jederzeit in der App oder über die Website-Einstellungen des Browsers löschen.",
  },
];

export default function Impressum() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-8">
      <section className="grid overflow-hidden rounded-2xl bg-card shadow-[0_0_0_1px_hsl(var(--border)),0_24px_64px_-40px_hsl(var(--primary)/0.45)] lg:grid-cols-[1.35fr_0.65fr]">
        <div className="flex flex-col justify-center p-7 sm:p-10 lg:p-12">
          <Badge className="mb-5 w-fit bg-primary/10 text-primary hover:bg-primary/10">
            Local-first Infrastructure Analytics
          </Badge>
          <h1 className="max-w-2xl text-balance text-3xl font-bold tracking-tight sm:text-4xl">
            RVTools Analyzer
          </h1>
          <p className="mt-4 max-w-2xl text-pretty text-base leading-7 text-muted-foreground sm:text-lg">
            Der RVTools Analyzer wertet RVTools-XLSX-Exporte lokal aus und macht Informationen zu Infrastruktur,
            Kapazität, Performance, Netzwerk, Hardware und Lifecycle übersichtlich nutzbar.
          </p>
        </div>

        <div className="flex min-h-56 items-center justify-center bg-primary/[0.06] p-10 lg:min-h-80">
          <img
            src="/favicon-master.png"
            alt="RVTools Analyzer Logo"
            className="h-40 w-40 rounded-[2rem] object-cover shadow-[0_20px_55px_-25px_hsl(var(--primary)/0.7)] outline outline-1 outline-black/10 sm:h-48 sm:w-48 dark:outline-white/10"
          />
        </div>
      </section>

      <section aria-labelledby="local-data-heading" className="space-y-4">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Datenschutz durch Architektur</p>
          <h2 id="local-data-heading" className="mt-2 text-balance text-2xl font-semibold tracking-tight">
            Ihre Daten bleiben lokal
          </h2>
          <p className="mt-2 text-pretty leading-7 text-muted-foreground">
            Die Anwendung ist bewusst ohne Server-Persistenz aufgebaut. Ihre Analysedaten verbleiben im
            Speicher Ihres Browsers.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {privacyFacts.map((fact) => (
            <Card key={fact.title} className="shadow-none">
              <CardContent className="p-6">
                <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <fact.icon className="h-5 w-5" aria-hidden="true" />
                </div>
                <h3 className="text-base font-semibold">{fact.title}</h3>
                <p className="mt-2 text-pretty text-sm leading-6 text-muted-foreground">{fact.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section aria-labelledby="imprint-heading" className="pb-4">
        <Card className="overflow-hidden shadow-none">
          <CardContent className="grid gap-8 p-7 sm:p-8 md:grid-cols-[0.85fr_1.15fr]">
            <div>
              <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <CircleUserRound className="h-5 w-5" aria-hidden="true" />
              </div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Verantwortlich</p>
              <h2 id="imprint-heading" className="mt-2 text-2xl font-semibold tracking-tight">
                Impressum
              </h2>
            </div>

            <address className="space-y-5 text-sm not-italic">
              <div>
                <p className="text-base font-semibold text-foreground">Philipp Asanger</p>
                <div className="mt-3 flex items-start gap-3 text-muted-foreground">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                  <p className="leading-6">
                    Karl-Renner-Str. 3
                    <br />
                    4040 Linz
                    <br />
                    Österreich
                  </p>
                </div>
              </div>

              <a
                href="mailto:philipp.asanger@gmail.com"
                className="inline-flex min-h-10 items-center gap-3 rounded-lg text-primary underline-offset-4 transition-colors hover:text-primary/80 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <Mail className="h-4 w-4" aria-hidden="true" />
                philipp.asanger@gmail.com
              </a>
            </address>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
