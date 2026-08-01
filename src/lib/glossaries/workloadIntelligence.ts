import type { GlossaryEntry } from "@/lib/glossary";

/**
 * Glossar für die VM-Tabs „VM-Profile“ und „Rightsizing“ (Workload Intelligence).
 * Zielgruppe: VMware-Administrator:innen und Kapazitätsplanung.
 */

const RV = "RVTools";
const VROPS = "vROps-Zeitreihenimport";

/* ------------------------------------------------------------------ */
/*  VM-Profile – UI                                                    */
/* ------------------------------------------------------------------ */
export const VM_PROFILE_UI: Record<string, GlossaryEntry> = {
  behaviorClass: {
    term: "Verhaltensklasse",
    description:
      "Aus Lastmuster und Auslastungsniveau zusammengefasste Einzelklasse. Ein niedriges Niveau überschreibt dabei das Muster, weshalb „gering genutzt“ nichts über den zeitlichen Verlauf aussagt – dafür sind die Spalten „Lastmuster“ und „Auslastungsniveau“ genauer. Erhalten für Vergleichbarkeit mit früheren Auswertungen.",
  },
  shape: {
    term: "Lastmuster",
    description:
      "Zeitlicher Verlauf der CPU-Last über sieben Tage, bewusst unabhängig von der Höhe der Auslastung: Dauerlast, Grundlast mit Lastfenster, Business-Hours, nächtlicher Batch, Wochenendlast, bursty, unregelmäßig oder variabel. Eine schwach ausgelastete VM behält damit ihr erkennbares Muster – etwa ein Nachtjob, der nur wenig CPU braucht.",
  },
  shapeConstantWithPeak: {
    term: "Grundlast mit Lastfenster",
    description:
      "Gleichmäßige Last mit einem zusätzlich erkennbaren Zeitfenster erhöhter Nutzung. Diese VMs fallen außerhalb des Fensters nie unter etwa ein Drittel ihrer Spitzenlast – anders als bei Business-Hours oder nächtlichem Batch lassen sie sich deshalb nicht abschalten oder verschieben, wohl aber in der Kapazitätsplanung berücksichtigen. Welches Fenster überwiegt, zeigen die Konzentrationskennzahlen.",
  },
  intensity: {
    term: "Auslastungsniveau",
    description:
      "Höhe der CPU-Last als P95 relativ zur konfigurierten Kapazität, bewusst unabhängig vom zeitlichen Muster: ruhend (< 2 %), sehr niedrig (2–5 %), niedrig (5–10 %), mittel (10–25 %), erhöht (25–50 %), hoch (ab 50 %). „Unbekannt“, solange Hostfrequenz oder vCPU-Zahl fehlen.",
  },
  confidence: {
    term: "Vertrauensniveau",
    description:
      "Wie verlässlich die Klassifikation ist, abgeleitet aus Datenabdeckung und Stundenzahl: „hoch“ ab rund 90 % Abdeckung über mehrere Tage, „niedrig“ unter 50 % oder einem Tag, „nicht berechenbar“ ohne jeden Messwert.",
  },
};

export const VM_PROFILE_KPI: Record<string, GlossaryEntry> = {
  profiledVms: {
    term: "VMs mit Profil",
    description: "Anzahl der VMs, die eindeutig einer vROps-Zeitreihe zugeordnet werden konnten.",
    source: `${VROPS} · Objektabgleich`,
  },
  lowConfidence: {
    term: "Niedriges Vertrauen",
    description: "VMs, deren Klassifikation wegen geringer Datenabdeckung oder zu kurzer Zeitreihe als unsicher gilt.",
    source: "berechnet · Datenabdeckung",
  },
  averageCoverage: {
    term: "Ø Datenabdeckung",
    description: "Mittlere Abdeckung der erwarteten Stunden über alle profilierten VMs – zeigt, wie lückenhaft der Import insgesamt ist.",
    source: "berechnet",
  },
  irregular: {
    term: "Unregelmäßig",
    description: "VMs mit ausreichender Datenbasis, deutlich wechselnder Last und geringer Ähnlichkeit zwischen den einzelnen Tagesprofilen. Variable Mischlast und nicht berechenbare Profile werden separat ausgewiesen.",
    source: "berechnet",
  },
  idle: {
    term: "Ruhend",
    description: "VMs mit einem CPU-Demand-P95 unter 2 % der konfigurierten Kapazität. Der engste und damit belastbarste Kandidatenkreis für Rückbau oder Zusammenlegung – im Gegensatz zu „gering genutzt“, das bis 10 % reicht und deutlich mehr VMs umfasst.",
    source: "berechnet",
  },
  highIntensity: {
    term: "Hohe Auslastung",
    description: "VMs mit einem CPU-Demand-P95 auf dem höchsten Auslastungsniveau. Kandidaten, bei denen ein Rightsizing nach oben statt nach unten zu prüfen ist.",
    source: "berechnet",
  },
  unclassified: {
    term: "Nicht klassifizierbar",
    description: "VMs, deren Zeitreihe für eine Muster- oder Niveaueinordnung nicht ausreicht (z.B. zu wenige verwertbare Stunden). Ergebnis ist keine Aussage, kein „unauffällig“.",
    source: "berechnet",
  },
};

export const VM_PROFILE_COLUMNS: Record<string, GlossaryEntry> = {
  vmName: { term: "VM", description: "Anzeigename der VM in vCenter.", source: `${RV} · vInfo · „VM“` },
  cluster: { term: "Cluster", description: "HA/DRS-Cluster der VM.", source: `${RV} · vInfo · „Cluster“` },
  sysv: { term: "Systemverantwortlicher", description: "Primär zuständige Person aus der ergänzenden Tech-Info/CMDB. Die Zuordnung erfolgt über den VM-Namen.", source: "Tech-Info" },
  sysvDepartment: { term: "Abteilung", description: "Abteilung der/des Systemverantwortlichen als Pfad „Organisation/Bereich-Abteilung“. Die Textsuche der Filterleiste greift auf dieses Feld zu: eine Suche nach der Abteilung schränkt den gesamten Tab auf deren VMs ein.", source: "Tech-Info" },
  host: { term: "Host", description: "ESXi-Host, auf dem die VM zum Exportzeitpunkt lief.", source: `${RV} · vInfo · „Host“` },
  vcpu: { term: "vCPU", description: "Anzahl der konfigurierten virtuellen CPUs.", source: `${RV} · vInfo · „CPUs“` },
  shape: { term: "Lastmuster", description: "Zeitlicher Lastverlauf der letzten sieben Tage, unabhängig von der Höhe der Auslastung. Aus Variationskoeffizient, Kalenderkonzentrationen und Tageswiederholbarkeit abgeleitet.", source: "berechnet" },
  intensity: { term: "Niveau", description: "Auslastungshöhe als P95 relativ zur konfigurierten CPU-Kapazität, unabhängig vom zeitlichen Muster.", source: "berechnet" },
  behaviorClass: { term: "Verhaltensklasse", description: "Zusammenfassung von Lastmuster und Niveau in eine Einzelklasse; ein niedriges Niveau überschreibt das Muster. Für Musterfragen sind die Spalten „Lastmuster“ und „Niveau“ aussagekräftiger.", source: "berechnet" },
  confidence: { term: "Vertrauen", description: "Vertrauensniveau der Klassifikation.", source: "berechnet" },
  coverage: { term: "Abdeckung", description: "Anteil der erwarteten Stunden, für die ein CPU-Demand-Wert vorliegt.", source: "berechnet" },
  sparkline: { term: "7-Tage-Profil", description: "CPU Demand je Stunde der letzten sieben Tage – Grundlage der Klassifikation.", source: VROPS },
  demandAvg: { term: "Demand Ø", description: "Mittlerer CPU-Demand über alle verwertbaren Stunden.", source: VROPS },
  demandP50: { term: "Demand P50", description: "Median des stündlichen CPU-Demand – die „typische“ Stunde.", source: VROPS },
  demandP95: { term: "Demand P95", description: "95.-Perzentil des CPU-Demand – konservativer Planungswert, robust gegen einzelne Spitzen.", source: VROPS },
  demandP95Pct: { term: "Demand P95 %", description: "95.-Perzentil des CPU-Demand relativ zur konfigurierten CPU-Kapazität der VM. Ohne bekannte Kapazität nicht berechenbar.", source: "berechnet" },
  demandMax: { term: "Demand Max", description: "Höchster beobachteter CPU-Demand innerhalb der sieben Tage.", source: VROPS },
  readyP95: { term: "Ready P95", description: "95.-Perzentil des CPU Ready – anhaltende Werte über 5 % deuten auf CPU-Contention hin.", source: VROPS },
};

export const VM_PROFILE_SECTIONS: Record<string, GlossaryEntry> = {
  distribution: {
    term: "Verteilung der Lastmuster",
    description: "Anzahl der VMs je zeitlichem Lastmuster – unabhängig davon, wie hoch die Last ausfällt. Variable Last bezeichnet wiederkehrende Mischlast; „unregelmäßig“ setzt eine geringe Tageswiederholbarkeit voraus. Kalendergeprägte Muster sind Kandidaten für Zeitsteuerung, „bursty“ für Rightsizing.",
  },
  intensityDistribution: {
    term: "Verteilung der Auslastungsniveaus",
    description: "Anzahl der VMs je Auslastungshöhe (P95 relativ zur konfigurierten CPU-Kapazität) – unabhängig vom zeitlichen Muster. Ein starkes Gewicht auf den unteren Stufen zeigt CPU-Überprovisionierung im Bestand.",
  },
  table: {
    term: "VM-Profile",
    description: "Alle VMs mit eindeutig zugeordneter Zeitreihe, sortiert nach Namen. Klick auf eine Zeile öffnet die Detailansicht.",
  },
};

/* ------------------------------------------------------------------ */
/*  Rightsizing – KPIs                                                 */
/* ------------------------------------------------------------------ */
export const RIGHTSIZING_KPI: Record<string, GlossaryEntry> = {
  candidateCount: {
    term: "Rightsizing-Kandidaten",
    description: "VMs mit vielen vCPU bei geringem genutztem Bedarf, auffälligem CPU Ready, Co-Stop unter Last, stark konzentrierter Last oder mit rückgewinnbarer bzw. fehlender vCPU-Kapazität. Ausschließlich prüfpflichtige Hinweise – keine automatische Änderung.",
    source: "berechnet",
  },
  configuredVcpu: {
    term: "Konfigurierte vCPU",
    description: "Summe der konfigurierten vCPU über alle betrachteten VMs. Bezugsgröße für die rückgewinnbare vCPU-Kapazität.",
    source: `${RV} · vInfo · „CPUs“`,
  },
  reclaimableVcpu: {
    term: "Rückgewinnbare vCPU",
    description: "Summe aus konfigurierter minus empfohlener vCPU über alle Kandidaten. Eine Näherung auf Basis des aktuellen Hosts – vor jeder Umsetzung fachlich prüfen.",
    source: "berechnet",
  },
  manyVcpuLowDemand: {
    term: "Viele vCPU, geringer Bedarf",
    description: "VMs mit mindestens 4 vCPU, deren genutztes vCPU-Äquivalent bei P95 höchstens 30 % der konfigurierten vCPU beträgt.",
    source: "berechnet",
  },
  highCpuReady: {
    term: "Auffälliges CPU Ready",
    description: "VMs mit CPU Ready P95 über 5 %. Rightsizing kann Ready hier sogar verschlechtern – vor einer Reduktion die Ursache prüfen.",
    source: VROPS,
  },
  withheldRecommendation: {
    term: "Ohne Empfehlung",
    description: "VMs, für die aus Vorsicht keine Größenänderung vorgeschlagen wird – zu dünne Datenbasis, ein Lastmuster ohne reproduzierbaren Verlauf, eine nicht wiederkehrende Spitze oder eine Vergrößerung, die nur an einer einzelnen Spitze hinge.",
    source: "berechnet",
  },
  additionalVcpu: {
    term: "Zusätzlich nötige vCPU",
    description: "Summe der fehlenden vCPU über alle zu klein konfigurierten VMs. Gegenrichtung zur rückgewinnbaren Kapazität und im Bestand deutlich kleiner: Nur wenige VMs laufen dauerhaft nahe an ihrer Kapazitätsgrenze.",
    source: "berechnet",
  },
};

export const RIGHTSIZING_COLUMNS: Record<string, GlossaryEntry> = {
  vmName: { term: "VM", description: "Anzeigename der VM in vCenter.", source: `${RV} · vInfo · „VM“` },
  cluster: { term: "Cluster", description: "HA/DRS-Cluster der VM.", source: `${RV} · vInfo · „Cluster“` },
  host: { term: "Host", description: "Aktueller ESXi-Host; Grundlage der MHz-pro-Core-Näherung.", source: `${RV} · vInfo · „Host“` },
  sysv: {
    term: "Systemverantwortlicher",
    description: "Systemverantwortliche:r aus der ergänzenden Tech-Info/CMDB – kein RVTools-Feld, sondern über den VM-Namen verknüpft.",
    source: "Tech-Info",
  },
  sysvDepartment: {
    term: "Abteilung",
    description: "Abteilung der/des Systemverantwortlichen als Pfad „Organisation/Bereich-Abteilung“. Die Textsuche der Filterleiste greift auf dieses Feld zu: eine Suche nach der Abteilung schränkt den gesamten Tab auf deren VMs ein.",
    source: "Tech-Info",
  },
  vcpu: { term: "Konfiguriert", description: "Aktuell zugewiesene vCPU-Anzahl.", source: `${RV} · vInfo · „CPUs“` },
  demandP50: { term: "Demand P50", description: "Median des stündlichen CPU-Demand.", source: VROPS },
  demandP95: { term: "Demand P95", description: "95.-Perzentil des CPU-Demand – Basis der empfohlenen vCPU-Größe.", source: VROPS },
  demandP95Pct: {
    term: "Demand P95 %",
    description: "Genutztes vCPU-Äquivalent bei P95 relativ zur konfigurierten vCPU-Anzahl – dieselbe Kennzahl wie „CPU Demand P95“, nur als Anteil statt in MHz.",
    source: "berechnet",
  },
  demandMax: { term: "Demand Max", description: "Höchster beobachteter CPU-Demand.", source: VROPS },
  readyP95: { term: "Ready P95", description: "95.-Perzentil des CPU Ready.", source: VROPS },
  usedVcpuEquivalent: {
    term: "Genutztes vCPU-Äquivalent",
    description: "P95-CPU-Demand geteilt durch die MHz pro Core des aktuellen Hosts – wie viele vCPU der beobachtete Bedarf tatsächlich auslastet.",
    source: `berechnet · ${RV} · vInfo/vHost · „CPU MHz“ / „# Cores“`,
  },
  usedVcpuEquivalentPeak: {
    term: "Genutzt Spitze",
    description: "Dasselbe für die Lastspitze innerhalb der Stunde. Der P95 stündlicher Mittelwerte verbirgt kurze Spitzen – über den Bestand gemessen liegt die tatsächliche Spitze im Median beim Doppelten des Stundenmittels. Verwendet wird das 99.-Perzentil dieser Spitzenwerte, nicht ihr Monatsmaximum: Jenes ist ein einzelner 20-Sekunden-Wert und würde ein Viertel aller VMs als zu klein ausweisen.",
    source: VROPS,
  },
  demandBasedVcpu: {
    term: "Bedarfsgerecht",
    description: "Zielgröße, die der gemessene Bedarf allein hergibt: kleinste gerade vCPU-Zahl mit höchstens 65 % Auslastung beim P95 und höchstens 90 % bei der Lastspitze. Bewusst nicht auf die heutige Größe gedeckelt – liegt der Wert darüber, ist die VM zu klein konfiguriert. Das Endziel der Planung, nicht der nächste Schritt, und auch dort ausgewiesen, wo keine Empfehlung ausgesprochen wird.",
    source: "berechnet",
  },
  additionalVcpu: {
    term: "Zusätzlich nötig",
    description: "Fehlende vCPU bei zu klein konfigurierten VMs, immer eine gerade Zahl. Anders als bei der Verkleinerung gibt es hier keine Schrittbegrenzung: Wer dauerhaft an der Kapazitätsgrenze läuft, ist mit einem halben Schritt nicht geholfen. Vorgeschlagen nur bei mindestens 24 Stunden über 75 % der Kapazität – eine einzelne Spitze genügt nicht.",
    source: "berechnet",
  },
  costopUnderLoad: {
    term: "Co-Stop unter Last",
    description: "95.-Perzentil des Peak-vCPU-Co-Stop, ausgewertet nur in Stunden über 25 % Kapazität. Co-Stop entsteht, wenn der Hypervisor die vCPU einer breiten VM nicht gleichzeitig einplanen kann – es ist der einzige direkte Nachweis, dass die vCPU-Anzahl selbst Leistung kostet und eine Verkleinerung die VM schneller macht. Über alle Stunden gerechnet wäre der Wert wertlos, weil fast jede VM irgendwann einen Ausschlag zeigt.",
    source: VROPS,
  },
  concentrationIndex: {
    term: "Lastkonzentration",
    description: "Wie ungleich sich die Last über die vCPU verteilt, von 0 (gleichmäßig) bis 1 (ein Kern trägt alles), gemessen im oberen Bereich der lasthaltigen Stunden. Im Bestand liegt der Wert typischerweise unter 0,1 – die Anwendungen skalieren also über ihre vCPU. Ab 0,4 bleiben zusätzliche Kerne wirkungslos.",
    source: VROPS,
  },
  recommendedVcpu: {
    term: "Empfohlen",
    description: "Nächster überprüfbarer Schritt in Richtung der bedarfsgerechten Größe, begrenzt auf ein Viertel der heutigen vCPU pro Runde – mindestens aber ein vCPU-Paar, weil kleinere Schritte nicht möglich sind. Nach der Umsetzung zeigt die nächste Messung, ob ein weiterer Schritt tragfähig ist. Eine prüfpflichtige Kandidatengröße, keine automatische Änderung.",
    source: "berechnet",
  },
  reclaimableVcpu: {
    term: "Rückgewinnbar",
    description: "Differenz aus konfigurierter und empfohlener vCPU, nie negativ und immer eine gerade Zahl – vCPU werden paarweise zurückgegeben. Null, solange keine Empfehlung ausgesprochen wird.",
    source: "berechnet",
  },
  recommendationWithheld: {
    term: "Keine Empfehlung, weil",
    description: "Verkleinerung und Vergrößerung tragen unterschiedliche Risiken und werden deshalb unterschiedlich abgesichert. Eine Verkleinerung unterbleibt bei zu dünner Datenbasis (Vertrauen unter „hoch“), bei den Mustern unregelmäßig und nicht berechenbar sowie bei bursty-VMs, deren Spitze sich nicht wochenweise wiederholt. Eine Vergrößerung unterbleibt, solange nur eine einzelne Spitze dafür spricht und keine Dauerlast nahe der Kapazitätsgrenze. Die Kennzahlen bleiben in jedem Fall zur eigenen Beurteilung sichtbar.",
    source: "berechnet",
  },
  weeklyRepeatability: {
    term: "Wochen-Wiederholbarkeit",
    description: "Wie ähnlich sich die vollen Wochen einer VM sind (Korrelation der 168-Stunden-Verläufe) und wie gleichmäßig hoch ihre Wochenmaxima ausfallen. Entscheidet bei bursty-VMs darüber, ob die Spitze planbar ist: Im Bestand wiederholt rund die Hälfte von ihnen den Wochenverlauf zuverlässig, während das bei unregelmäßigen VMs praktisch nie zutrifft. Braucht mindestens zwei volle Wochen Messdaten.",
    source: "berechnet",
  },
  shape: { term: "Lastmuster", description: "Zeitliches Lastmuster aus dem VM-Profile-Tab – dieselbe Berechnung, keine zweite Profillogik. Unabhängig von der Auslastungshöhe, daher auch bei schwach ausgelasteten Kandidaten aussagekräftig.", source: "berechnet" },
  intensity: { term: "Niveau", description: "Auslastungsniveau aus dem VM-Profile-Tab: P95 relativ zur konfigurierten CPU-Kapazität.", source: "berechnet" },
  behaviorClass: { term: "Verhaltensklasse", description: "Verhaltensklasse aus dem VM-Profile-Tab – dieselbe Berechnung, keine zweite Profillogik.", source: "berechnet" },
  confidence: { term: "Vertrauen", description: "Vertrauensniveau der zugrunde liegenden Klassifikation.", source: "berechnet" },
};

export const RIGHTSIZING_SECTIONS: Record<string, GlossaryEntry> = {
  densityGrid: {
    term: "Konfigurierte vCPU vs. CPU Demand P95 %",
    description: "Das Raster gruppiert VMs nach konfigurierten vCPU (Spalten) und CPU-Bedarf in stark ausgelasteten Stunden (Zeilen). P95 bedeutet: In 95 % der gemessenen Stunden lag der Bedarf höchstens bei diesem Wert – einzelne kurze Spitzen zählen nicht. Die Zahl zeigt die VM-Anzahl, die Farbtiefe deren Dichte. Rechts unten liegen Kandidaten für eine Verkleinerung; gelbe und rote Zeilen ab 90 % weisen auf möglicherweise zu klein konfigurierte VMs hin. Belegte Kacheln öffnen per Klick die zugehörigen VMs mit ihren wichtigsten Rightsizing-Metriken.",
  },
  densityCellDetails: {
    term: "VMs der Rightsizing-Kachel",
    description: "Zeigt genau die VMs des gewählten vCPU- und CPU-Demand-P95-Bands. Empfehlungen sind prüfpflichtige Zielgrößen und führen keine automatische Änderung aus.",
  },
  candidateTable: {
    term: "vCPU-Vergleich je VM",
    description: "Vergleicht konfigurierte vCPU mit beobachtetem CPU Demand und Ready. Hervorgehobene Zeilen sind auffällige Kandidaten – die Tabelle selbst zeigt alle VMs mit gültiger vCPU-Angabe.",
  },
  clusterSummary: {
    term: "Rückgewinnbare vCPU je Cluster",
    description: "Summiert die rückgewinnbare vCPU-Kapazität aller Kandidaten je Cluster – ein Ausgangspunkt für Konsolidierung oder Fill-Up-Planung.",
  },
  shapeSummary: {
    term: "Rückgewinnbare vCPU je Lastmuster",
    description: "Summiert die rückgewinnbare vCPU-Kapazität je zeitlichem Lastmuster aus dem VM-Profile-Tab – zeigt, welche Muster das größte Rightsizing-Potenzial haben. Bewusst nach Muster statt nach Verhaltensklasse gruppiert: Rightsizing-Kandidaten sind ohnehin überwiegend schwach ausgelastet, wodurch eine Gruppierung nach Verhaltensklasse fast alle in „gering genutzt“ sammeln würde.",
  },
};
