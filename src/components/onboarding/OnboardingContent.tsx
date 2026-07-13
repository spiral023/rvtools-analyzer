import {
  BarChart3,
  Boxes,
  Download,
  Filter,
  Layers3,
  Server,
  ShieldCheck,
} from "lucide-react";

export function WelcomePage() {
  return (
    <section className="onboarding-stagger mx-auto grid h-full max-w-5xl items-center gap-10 lg:grid-cols-[1fr_0.85fr]">
      <div>
        <p className="font-mono text-xs uppercase tracking-[0.22em] text-primary">
          Local-first Infrastructure Analytics
        </p>
        <h2
          tabIndex={-1}
          className="onboarding-heading mt-5 text-4xl font-semibold tracking-tight sm:text-6xl"
        >
          Infrastruktur.
          <br />
          <em className="font-serif text-primary">Durchblick.</em>
        </h2>
        <p className="mt-6 max-w-xl text-base leading-7 text-muted-foreground">
          RVTools- und Tech-Info-Daten lokal verbinden, gezielt analysieren und
          verständlich exportieren – ohne eigenes Daten-Backend.
        </p>
        <div className="mt-7 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full border bg-card/60 px-3 py-1.5">
            Verarbeitung im Browser
          </span>
          <span className="rounded-full border bg-card/60 px-3 py-1.5">
            Lokale Speicherung
          </span>
        </div>
      </div>
      <div className="onboarding-logo-stage">
        <img
          src="/favicon-master.png"
          alt="RVTools Analyzer Logo"
          className="h-44 w-44 rounded-[2rem] object-cover sm:h-56 sm:w-56"
        />
      </div>
    </section>
  );
}

export function FilterPage() {
  return (
    <section className="onboarding-stagger mx-auto flex min-h-full max-w-5xl flex-col justify-center">
      <p className="font-mono text-xs uppercase tracking-[0.22em] text-primary">
        Gezielt fokussieren
      </p>
      <h2
        tabIndex={-1}
        className="onboarding-heading mt-3 text-3xl font-semibold tracking-tight sm:text-5xl"
      >
        Der globale Systemfilter
      </h2>
      <p className="mt-4 max-w-3xl leading-7 text-muted-foreground">
        RVTools- und Tech-Info-Felder lassen sich in gemeinsamen Filtergruppen
        verbinden. Alternativ grenzt eine eingefügte Systemliste die Analysen auf
        konkrete VMs ein.
      </p>
      <div className="mt-8 grid gap-4 md:grid-cols-[1fr_auto_1fr]">
        <div className="onboarding-feature-card">
          <Server className="h-5 w-5 text-primary" aria-hidden="true" />
          <strong>RVTools</strong>
          <span className="font-mono text-sm text-muted-foreground">Cluster = PROD</span>
        </div>
        <Filter className="hidden self-center text-primary md:block" aria-hidden="true" />
        <div className="onboarding-feature-card">
          <ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" />
          <strong>Tech-Info</strong>
          <span className="font-mono text-sm text-muted-foreground">
            Verantwortung = Team A
          </span>
        </div>
      </div>
      <div className="mt-4 rounded-xl border bg-card/70 p-4 font-mono text-sm text-muted-foreground">
        Systemliste: vm-app-01, vm-db-04, vm-web-12 …
      </div>
    </section>
  );
}

const features = [
  {
    icon: Boxes,
    title: "Detailansichten",
    text: "VMs, Hosts und Cluster direkt im Kontext untersuchen.",
  },
  {
    icon: BarChart3,
    title: "Durchschnittliche VM",
    text: "Eine typische Ressourcenbasis für Planung und Einordnung ermitteln.",
  },
  {
    icon: Layers3,
    title: "Varianten",
    text: "Host-Hardware- und Host-Netzwerk-Varianten vergleichen.",
  },
  {
    icon: Download,
    title: "Export",
    text: "Jede Tabelle als Excel oder Markdown mitnehmen.",
  },
] as const;

export function FeaturesPage() {
  return (
    <section className="onboarding-stagger mx-auto max-w-5xl">
      <p className="font-mono text-xs uppercase tracking-[0.22em] text-primary">
        Analysieren und mitnehmen
      </p>
      <h2
        tabIndex={-1}
        className="onboarding-heading mt-3 text-3xl font-semibold tracking-tight sm:text-5xl"
      >
        Die wichtigsten Werkzeuge
      </h2>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {features.map(({ icon: Icon, title, text }) => (
          <article key={title} className="onboarding-feature-card">
            <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
            <h3 className="font-semibold">{title}</h3>
            <p className="text-sm leading-6 text-muted-foreground">{text}</p>
          </article>
        ))}
      </div>
      <p className="mt-6 font-mono text-xs leading-6 text-muted-foreground">
        AUCH DABEI · DAILY OPS · CAPACITY · PERFORMANCE · STORAGE/BACKUP · LIFECYCLE ·
        FLEET COMPARE · PLANUNG
      </p>
    </section>
  );
}
