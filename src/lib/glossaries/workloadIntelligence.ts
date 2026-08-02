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
      "Zeitlicher Verlauf der CPU-Last über sieben Tage, bewusst unabhängig von der Höhe der Auslastung: Dauerlast, Business-Hours, nächtlicher Batch, Wochenendlast, bursty, unregelmäßig oder variabel. Eine schwach ausgelastete VM behält damit ihr erkennbares Muster – etwa ein Nachtjob, der nur wenig CPU braucht.",
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
  demandP95: { term: "Demand P95", description: "95.-Perzentil des stündlichen CPU-Demand: In 95 % der verwertbaren Stunden lag der Bedarf höchstens bei diesem Wert; die höchsten 5 % der Stunden liegen darüber. Dadurch ist der Wert robuster als ein Maximum, aber näher an der Spitzenlast als der Mittelwert.", source: VROPS },
  demandP95Pct: { term: "Demand P95 %", description: "95.-Perzentil des CPU-Demand relativ zur konfigurierten CPU-Kapazität der VM: In 95 % der verwertbaren Stunden lag der Bedarf höchstens bei diesem relativen Wert; nur die höchsten 5 % der Stunden liegen darüber. Ohne bekannte Kapazität nicht berechenbar.", source: "berechnet" },
  demandMax: { term: "Demand Max", description: "Höchster beobachteter CPU-Demand innerhalb der sieben Tage.", source: VROPS },
  readyP95: { term: "Ready P95", description: "95.-Perzentil des CPU Ready – anhaltende Werte über 5 % deuten auf CPU-Contention hin.", source: VROPS },
  coefficientOfVariation: { term: "Variationskoeffizient", description: "Standardabweichung geteilt durch den Mittelwert des stündlichen CPU-Demand. Niedrige Werte stehen für ein flaches, hohe Werte für ein wechselhaftes Lastprofil; er beschreibt die Form, nicht die absolute Auslastung.", source: "berechnet · vROps-Demand" },
  dutyCycle: { term: "Aktive Stunden", description: "Anteil der Messstunden, in denen der Demand mehr als 5 % der konfigurierten CPU-Kapazität erreicht. Er beantwortet: Wie viel der Woche arbeitet die VM wirklich nennenswert?", source: "berechnet · vROps-Demand/Kapazität" },
  baselineRatio: { term: "Grundlastanteil", description: "Verhältnis p10 zu P95 der Stundenwerte. Nahe 1 bedeutet eine flache Dauerlast; nahe 0 bedeutet deutliche Spitzen über einer niedrigen Grundlast.", source: "berechnet · vROps-Demand" },
  dailyRepeatability: { term: "Tages-Wiederholbarkeit", description: "Median der Ähnlichkeit zwischen Tagesprofilen. 1 bedeutet sehr ähnliche Tagesverläufe, 0 keinen erkennbaren Zusammenhang; mit wenigen gemeinsamen Stunden bleibt der Wert leer.", source: "berechnet · vROps-Demand" },
  weeklyRepeatability: { term: "Wochen-Wiederholbarkeit", description: "Ähnlichkeit vollständiger 168-Stunden-Wochen. Ein hoher Wert zeigt ein wiederkehrendes Wochenmuster und hilft, Spitzen als planbar oder unplanbar einzuordnen; mindestens zwei volle Wochen sind nötig.", source: "berechnet · vROps-Demand" },
  weeklyPeakVariation: { term: "Streuung der Wochenmaxima", description: "Variationskoeffizient der Wochenhöchstwerte. Niedrig bedeutet, dass die Spitzen von Woche zu Woche ähnlich hoch sind; hoch bedeutet, dass die Spitzen schwer planbar sind.", source: "berechnet · vROps-Demand" },
  businessHoursConcentration: { term: "Business-Hours-Konzentration", description: "Demand-Anteil Mo–Fr 06–17 Uhr relativ zum Anteil dieser Stunden an der Woche. 1 bedeutet gleichmäßig verteilt; Werte über 1 zeigen eine Konzentration in Geschäftszeiten.", source: "berechnet · vROps-Demand" },
  nightConcentration: { term: "Nacht-Konzentration", description: "Demand-Anteil werktags 00–06 Uhr relativ zum Anteil dieses Zeitfensters. Werte über 1 weisen auf nächtliche Jobs oder Batch-Verarbeitung hin.", source: "berechnet · vROps-Demand" },
  weekendConcentration: { term: "Wochenend-Konzentration", description: "Demand-Anteil am Wochenende relativ zum Anteil der Wochenendstunden. Werte über 1 zeigen Wochenendlast, Werte unter 1 eine eher werktags geprägte VM.", source: "berechnet · vROps-Demand" },
  configuredCapacity: { term: "Konfigurierte CPU-Kapazität", description: "CPU-Kapazität der VM in MHz, bevorzugt aus vROps; sonst als vCPU × MHz je Core des aktuellen Hosts angenähert. Sie ist die Bezugsgröße für Demand P95 in Prozent.", source: "berechnet · vROps/ RVTools vHost + vInfo" },
  hoursAboveCapacity75: { term: "Stunden über 75 % Kapazität", description: "Anzahl der Stunden, in denen der Demand mehr als 75 % der aktuell konfigurierten CPU-Kapazität überschritt. Viele solche Stunden sprechen eher für dauerhaften Mehrbedarf als für eine einzelne Spitze.", source: "berechnet · vROps-Demand/Kapazität" },
  hoursAboveCapacity90: { term: "Stunden über 90 % Kapazität", description: "Anzahl der Stunden, in denen der Demand mehr als 90 % der aktuell konfigurierten CPU-Kapazität überschritt. Der Wert zeigt, wie oft die VM nahe an ihrer heutigen Größe lief.", source: "berechnet · vROps-Demand/Kapazität" },
  costopUnderLoadP95: { term: "Co-Stop unter Last P95", description: "95.-Perzentil des Peak-vCPU-Co-Stop, aber nur in Stunden mit mehr als 25 % VM-Auslastung. Co-Stop zeigt, dass der Hypervisor die vCPU einer breiten VM nicht gleichzeitig einplanen konnte; hohe Werte können bedeuten, dass weniger vCPU die VM sogar flüssiger machen.", source: VROPS },
  singleCoreBoundHours: { term: "Stunden Einzelkern-Engpass", description: "Stunden, in denen der geschätzte heißeste Kern mindestens 90 % ausgelastet war, während die VM insgesamt höchstens 60 % ihrer Kapazität nutzte. Das ist ein Hinweis auf eine nicht parallelisierte Anwendung: zusätzliche vCPU helfen in diesen Stunden nicht.", source: VROPS },
  concentrationIndexP90: { term: "Lastkonzentration", description: "P90 des Konzentrationsindex über lasthaltige Stunden: 0 bedeutet gleichmäßige Verteilung über die vCPU, 1 annähernd Last auf nur einem Kern. Ab etwa 0,4 gilt die Last als stark auf wenige Kerne konzentriert – zusätzliche vCPU bleiben dann oft wirkungslos.", source: VROPS },
  effectiveCoresMax: { term: "Belastete Kerne (max.)", description: "Geschätzte höchste Zahl gleichzeitig wirksamer Kerne aus mittlerer und höchster Kernlast. Sie ist eine Obergrenze dafür, wie viele vCPU die Anwendung unter den beobachteten Mustern überhaupt nutzen kann.", source: VROPS },
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
    description: "Alle VMs mit eindeutig zugeordneter Zeitreihe und berechenbarem Lastmuster sowie Niveau, sortiert nach Namen. Klick auf eine Zeile öffnet die Detailansicht.",
  },
  uncomputableTable: {
    term: "Nicht berechenbare Profile",
    description: "VMs, für die Lastmuster oder Auslastungsniveau nicht belastbar abgeleitet werden konnten. Die Spalte „Grund“ zeigt, ob Messwerte, ausreichende Datenabdeckung oder die konfigurierte CPU-Kapazität fehlen.",
  },
  detailTrend: {
    term: "Auslastungsverlauf",
    description: "Stündlicher Verlauf der VM: Die Linie zeigt den mittleren CPU Demand, das Band macht den Bereich bis zur innerhalb der Stunde beobachteten Spitze sichtbar. CPU Ready wird separat eingeblendet, weil es Wartezeit auf physische Cores und nicht CPU-Verbrauch misst. Zeitverlauf und durchschnittliche Woche beantworten unterschiedliche Fragen: einmal konkrete Historie, einmal wiederkehrendes Muster.",
    source: VROPS,
  },
  detailProfile: {
    term: "Lastprofil",
    description: "Verdichtet das beobachtete Verhalten in zwei unabhängige Achsen: Lastmuster beschreibt, wann die VM arbeitet; Auslastungsniveau beschreibt, wie hoch ihr P95-Demand relativ zur Kapazität ist. Datenabdeckung und Vertrauensniveau zeigen, wie belastbar diese Einordnung ist.",
    source: "berechnet · vROps-Demand",
  },
};

/* ------------------------------------------------------------------ */
/*  Rightsizing – KPIs                                                 */
/* ------------------------------------------------------------------ */
export const RIGHTSIZING_KPI: Record<string, GlossaryEntry> = {
  candidateCount: {
    term: "Rightsizing-Kandidaten",
    description: "Berechenbare VMs mit vielen vCPU bei geringem genutztem Bedarf, auffälligem CPU Ready, Co-Stop unter Last, stark konzentrierter Last oder mit rückgewinnbarer bzw. fehlender vCPU-Kapazität. Ausschließlich prüfpflichtige Hinweise – keine automatische Änderung.",
    source: "berechnet",
  },
  configuredVcpu: {
    term: "Konfigurierte vCPU",
    description: "Summe der konfigurierten vCPU über alle betrachteten VMs. Bezugsgröße für die rückgewinnbare vCPU-Kapazität.",
    source: `${RV} · vInfo · „CPUs“`,
  },
  reclaimableVcpu: {
    term: "Rückgewinnbare vCPU",
    description: "Summe aus konfigurierter minus empfohlener vCPU über alle Kandidaten – der vollständige Betrag, nicht der erste Umsetzungsschritt. Vor jeder Umsetzung fachlich prüfen.",
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
    description: "Dasselbe für die Lastspitze innerhalb der Stunde. Der P95 stündlicher Mittelwerte verbirgt kurze Spitzen – über den Bestand gemessen liegt die tatsächliche Spitze im Median beim Doppelten des Stundenmittels. Die globale Rightsizing-Stufe wählt geschlossen zwischen P95, P99, P99,5 und Maximum; es gibt keinen separaten Peak-Regler.",
    source: VROPS,
  },
  demandBasedVcpu: {
    term: "Bedarfsgerecht",
    description: "Zielgröße, die der gemessene Bedarf allein hergibt. Peak-Perzentil sowie P95- und Spitzen-Zielauslastung kommen als geschlossene Kombination aus der globalen Rightsizing-Stufe. Bewusst nicht auf die heutige Größe gedeckelt – liegt der Wert darüber, ist die VM zu klein konfiguriert. Das Endziel der Planung, nicht der nächste Schritt, und auch dort ausgewiesen, wo keine Empfehlung ausgesprochen wird.",
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
  singleCoreBound: {
    term: "Einzelkern-Engpass",
    description: "Mindestens 24 Stunden, in denen der geschätzte heißeste Kern zu mindestens 90 % ausgelastet ist, während die VM insgesamt höchstens 60 % ihrer Kapazität nutzt. Die Anwendung nutzt einen Kern; zusätzliche vCPU können nie helfen. Eigenständiges Verkleinerungsargument und sichtbare Warnung bei Vergrößerungsvorschlägen.",
    source: VROPS,
  },
  concentrationIndex: {
    term: "Lastkonzentration",
    description: "Wie ungleich sich die Last über die vCPU verteilt, von 0 (gleichmäßig) bis 1 (ein Kern trägt alles), gemessen im oberen Bereich der lasthaltigen Stunden. Im Bestand liegt der Wert typischerweise unter 0,1 – die Anwendungen skalieren also über ihre vCPU. Ab 0,4 bleiben zusätzliche Kerne wirkungslos.",
    source: VROPS,
  },
  recommendedVcpu: {
    term: "Empfohlen",
    description: "Die bedarfsgerechte Zielgröße, sofern sie ausgesprochen wird – eine prüfpflichtige Kandidatengröße, keine automatische Änderung. Sie wird in einem Schritt angesteuert; eine gestufte Zwischengröße weist die Analyse bewusst nicht aus.",
    source: "berechnet",
  },
  reclaimableVcpu: {
    term: "Rückgewinnbar",
    description: "Vollständige Differenz aus konfigurierter und empfohlener vCPU, nie negativ. Bewusst der ganze Betrag: Eine Schrittbegrenzung in dieser Zahl verdeckte über den Bestand knapp die Hälfte des Potenzials und traf ausgerechnet die breiten VMs. Null, solange keine Empfehlung ausgesprochen wird.",
    source: "berechnet",
  },
  recommendationWithheld: {
    term: "Keine Empfehlung, weil",
    description: "Verkleinerung und Vergrößerung tragen unterschiedliche Risiken und werden deshalb unterschiedlich abgesichert. Eine Verkleinerung unterbleibt bei zu dünner Datenbasis (Vertrauen unter „hoch“), bei den Mustern unregelmäßig und nicht berechenbar sowie bei bursty-VMs, deren Spitze sich nicht wochenweise wiederholt. Eine Vergrößerung unterbleibt, solange nur eine einzelne Spitze dafür spricht und keine Dauerlast nahe der Kapazitätsgrenze. Die Kennzahlen bleiben in jedem Fall zur eigenen Beurteilung sichtbar.",
    source: "berechnet",
  },
  configured: { term: "Konfiguriert", description: "Aktuell zugewiesene vCPU-Anzahl der VM. Sie ist die Vergleichsgröße für genutztes vCPU-Äquivalent und Rightsizing, nicht der tatsächlich belegte CPU-Bedarf.", source: `${RV} · vInfo · „CPUs“` },
  mhzPerVcpu: { term: "MHz je vCPU", description: "CPU-Kapazität pro vCPU. Der Wert stammt bevorzugt aus der VM-eigenen vROps-Kapazität und sonst aus Host-Takt geteilt durch Host-Cores; er übersetzt MHz-Demand in ein vCPU-Äquivalent.", source: "berechnet · vROps/vHost" },
  manyVcpuLowDemand: { term: "Viele vCPU, geringer Bedarf", description: "Mindestens 4 konfigurierte vCPU, deren P95-Bedarf höchstens 30 % der zugewiesenen vCPU entspricht. Das ist ein Verkleinerungshinweis, sofern Datenbasis und Lastmuster die Empfehlung tragen.", source: "berechnet" },
  highCpuReady: { term: "Auffälliges CPU Ready", description: "CPU Ready P95 über 5 %. Prüfe zuerst Host-/Cluster-Contention und die vCPU-Breite; ein blindes Verkleinern kann Ready verbessern oder verschlechtern – je nach Ursache.", source: VROPS },
  concentratedOnFewCores: { term: "Last auf wenigen Kernen", description: "Der Lastkonzentrationsindex liegt im auffälligen Bereich ab etwa 0,4. Mehr vCPU lösen keinen Einzelthread-Engpass, wenn die Anwendung die zusätzlichen Kerne nicht parallel nutzt.", source: "berechnet · vROps" },
  sustainedNearCapacity: { term: "Dauerhaft nahe Kapazität", description: "Mindestens 24 Stunden lagen über 75 % der aktuell konfigurierten CPU-Kapazität. Erst diese Dauerhaftigkeit trägt eine Vergrößerungsempfehlung; ein einzelner kurzer Peak reicht bewusst nicht.", source: "berechnet · vROps-Demand/Kapazität" },
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

export const RAM_RIGHTSIZING_COLUMNS: Record<string, GlossaryEntry> = {
  vmName: RIGHTSIZING_COLUMNS.vmName,
  cluster: RIGHTSIZING_COLUMNS.cluster,
  sysv: RIGHTSIZING_COLUMNS.sysv,
  sysvDepartment: RIGHTSIZING_COLUMNS.sysvDepartment,
  direction: {
    term: "Richtung",
    description: "Abgeleitete Handlung aus aktuellem RAM und dem empfohlenen Ziel: verkleinern, vergrößern, unverändert oder nicht berechenbar.",
    source: "berechnet",
  },
  vmCount: {
    term: "VMs",
    description: "Anzahl der VMs in der jeweiligen Richtung oder Gruppierung.",
    source: "berechnet",
  },
  shrinkCount: {
    term: "Verkleinern",
    description: "Anzahl der VMs, bei denen die berechnete RAM-Empfehlung unter der aktuellen Konfiguration liegt.",
    source: "berechnet",
  },
  growCount: {
    term: "Vergrößern",
    description: "Anzahl der VMs, bei denen der berechnete RAM-Bedarf über der aktuellen Konfiguration liegt.",
    source: "berechnet",
  },
  notComputableCount: {
    term: "Nicht berechenbar",
    description: "Anzahl der VMs ohne belastbare RAM-Empfehlung, zum Beispiel wegen fehlender Zeitreihe, zu geringer Datenabdeckung oder fehlender Konfiguration.",
    source: "berechnet",
  },
  reclaimableMemory: {
    term: "Freigebbar",
    description: "Summe des RAM, der bei VMs mit Verkleinerungsempfehlung zwischen aktueller und empfohlener Größe liegt.",
    source: "berechnet",
  },
  additionalMemory: {
    term: "Zusätzlich",
    description: "Summe des zusätzlichen RAM, der bei VMs mit Vergrößerungsempfehlung bis zur empfohlenen Größe fehlt.",
    source: "berechnet",
  },
  configuredMemory: {
    term: "RAM aktuell",
    description: "Aktuell konfigurierter Arbeitsspeicher der VM. Er ist die Bezugsgröße für die prozentualen Memory-Workload-Werte und die Rightsizing-Empfehlung.",
    source: "RVTools · vInfo · „Memory“",
  },
  workloadAvgP95: {
    term: "Workload Avg P95",
    description: "95. Perzentil der vROps-Memory-Workload-Avg-Reihe. Der Wert beschreibt den Anteil des konfigurierten RAM, der im normalen Verlauf beansprucht wurde.",
    source: "vROps-Zeitreihenimport · „Memory|Workload|Avg“",
  },
  workloadAvgP99: {
    term: "Workload Avg P99",
    description: "99. Perzentil der vROps-Memory-Workload-Avg-Reihe. Die aktive RAM-Policy kann diesen Wert als konservativere Normal-Last heranziehen.",
    source: "vROps-Zeitreihenimport · „Memory|Workload|Avg“",
  },
  peakWorkload: {
    term: "Peak-Workload",
    description: "Peak-Perzentil der vROps-Memory-Workload-Max-Reihe. Es berücksichtigt den höchsten beobachteten Workload innerhalb der Stunde; das konkrete Perzentil folgt der aktiven RAM-Policy.",
    source: "vROps-Zeitreihenimport · „Memory|Workload|Max“",
  },
  normalDemand: {
    term: "Bedarf normal",
    description: "RAM-Anforderung aus der gewählten Normal-Statistik der Avg-Reihe, umgerechnet auf MiB anhand der aktuellen RAM-Konfiguration.",
    source: "berechnet · vROps Memory Workload Avg",
  },
  peakDemand: {
    term: "Bedarf Spitze",
    description: "RAM-Anforderung aus der gewählten Peak-Statistik der Max-Reihe, umgerechnet auf MiB anhand der aktuellen RAM-Konfiguration.",
    source: "berechnet · vROps Memory Workload Max",
  },
  requiredMemory: {
    term: "Bedarfsgerecht",
    description: "Der höhere Wert aus normalem und Spitzenbedarf. Er zeigt den beobachteten RAM-Bedarf vor Sicherheitsreserve und Rundung.",
    source: "berechnet",
  },
  targetMemory: {
    term: "Ziel vor Rundung",
    description: "Bedarfsgerechter RAM geteilt durch den Zielauslastungsfaktor der RAM-Policy. Die Rundung auf einen praktikablen Schritt ist hier noch nicht enthalten.",
    source: "berechnet · RAM-Policy",
  },
  recommendedMemory: {
    term: "RAM empfohlen",
    description: "Prüfpflichtige Zielgröße nach Anwendung des Zielauslastungsfaktors und der konfigurierten Rundungsstufe. Sie ist keine automatische Änderung.",
    source: "berechnet · RAM-Policy",
  },
  reclaimableMemoryVm: {
    term: "Rückgewinnbar",
    description: "RAM-Differenz zwischen aktueller und empfohlener Größe, wenn die Richtung „Verkleinern“ lautet. Bei anderen Richtungen bleibt die Spalte leer.",
    source: "berechnet",
  },
  additionalMemoryVm: {
    term: "Zusätzlich",
    description: "RAM-Differenz zwischen aktueller und empfohlener Größe, wenn die Richtung „Vergrößern“ lautet. Bei anderen Richtungen bleibt die Spalte leer.",
    source: "berechnet",
  },
  deltaMemory: {
    term: "Delta",
    description: "Signierte Differenz aus empfohlener minus aktueller RAM-Größe: negativ bedeutet freigebbar, positiv bedeutet zusätzlich erforderlich.",
    source: "berechnet",
  },
  coverage: {
    term: "Coverage",
    description: "Anteil der erwarteten Stunden mit verwertbaren Memory-Workload-Avg-Werten. Eine geringe Abdeckung senkt das Vertrauen und kann eine Empfehlung verhindern.",
    source: "berechnet · vROps Memory Workload Avg",
  },
  confidence: {
    term: "Vertrauen",
    description: "Datenqualitätsstufe der RAM-Bewertung aus Stichprobengröße und Zeitreihenabdeckung; sie sagt, wie belastbar die Empfehlung ist.",
    source: "berechnet · RAM-Policy",
  },
  reason: {
    term: "Begründung",
    description: "Warum für diese VM keine RAM-Empfehlung ausgesprochen wird, etwa wegen fehlender Daten, unzureichender Abdeckung oder fehlender RAM-Konfiguration.",
    source: "berechnet",
  },
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
    description: "Vergleicht konfigurierte vCPU mit beobachtetem CPU Demand und Ready. Hervorgehobene Zeilen sind auffällige Kandidaten. Die Tabelle enthält nur VMs mit berechenbarem Lastmuster und bekanntem Auslastungsniveau.",
  },
  uncomputableTable: {
    term: "Nicht berechenbare Rightsizing-VMs",
    description: "Zeigt VMs, für die das Lastmuster oder das Auslastungsniveau nicht belastbar berechnet werden konnte. Diese Zeilen bleiben sichtbar, fließen aber nicht in vCPU-Vergleich, Kennzahlen, Diagramme oder Zusammenfassungen ein.",
  },
  clusterSummary: {
    term: "Rückgewinnbare vCPU je Cluster",
    description: "Summiert die rückgewinnbare vCPU-Kapazität aller Kandidaten je Cluster. Der Prozentwert setzt dieses Potenzial zur gesamten konfigurierten vCPU-Menge des Clusters ins Verhältnis – ein Ausgangspunkt für Konsolidierung oder Fill-Up-Planung.",
  },
  shapeSummary: {
    term: "Rückgewinnbare vCPU je Lastmuster",
    description: "Summiert die rückgewinnbare vCPU-Kapazität je zeitlichem Lastmuster aus dem VM-Profile-Tab. Der Prozentwert bezieht sie auf die insgesamt konfigurierten vCPU dieses Musters und zeigt so die relative Rückgewinnbarkeit. Bewusst nach Muster statt nach Verhaltensklasse gruppiert: Rightsizing-Kandidaten sind ohnehin überwiegend schwach ausgelastet, wodurch eine Gruppierung nach Verhaltensklasse fast alle in „gering genutzt“ sammeln würde.",
  },
  recommendationMix: {
    term: "Empfehlungswege",
    description: "Teilt alle betrachteten VMs in die unmittelbaren Handlungspfade auf: Verkleinern mit rückgewinnbaren vCPU, Vergrößern bei belegtem Mehrbedarf sowie Beibehalten beziehungsweise weiter prüfen. Die letzte Gruppe enthält auch zurückgehaltene Empfehlungen, etwa bei zu dünner oder nicht wiederholbarer Datenbasis.",
  },
};
