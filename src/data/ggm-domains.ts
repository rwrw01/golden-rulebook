/**
 * GGM (Gemeentelijk Gegevensmodel) domain definitions
 * Maps BlueDolphin bedrijfsfuncties to municipal domains via keyword matching
 * Domain order matters: classifyFunction uses first-match. Specific domains first, generic last.
 */

export interface GgmDomain {
  id: string;
  name: string;
  color: string;
  keywords: string[];
}

export const GGM_DOMAINS: GgmDomain[] = [
  {
    id: 'burgerzaken',
    name: 'Burgerzaken',
    color: '#4f8ff7',
    keywords: [
      'bevolking', 'burgerlijke stand', 'reisdocument', 'identiteit', 'nederlanderschap',
      'officiële document', 'persoonlijke gegeven', 'persoonsgegevens', 'adoptie',
      'afstamming', 'achternaam', 'geboorte', 'overlijden', 'huwelijk', 'naamgebruik',
      'brp', 'gba', 'paspoort', 'rijbewijs', 'verklaring omtrent gedrag',
    ],
  },
  {
    id: 'onderwijs',
    name: 'Onderwijs',
    color: '#8b5cf6',
    keywords: [
      'onderwijs', 'leerplicht', 'leerling', 'school', 'educatie', 'kinderopvang',
      'peuterspeelzaal', 'volwasseneducatie', 'onderwijshuisvesting',
    ],
  },
  {
    id: 'sociaal-domein',
    name: 'Sociaal Domein',
    color: '#f59e0b',
    keywords: [
      'wmo', 'jeugd', 'participatie', 'schuldhulp', 'sociaal', 'zelfredzaamheid',
      'voorziening', 'casusregie', 'sociale werkvoorziening', 'flankerende',
      'kredietverstrekking', 'arbeidsmarkt', 'vraag en aanbod matching',
      'sociale netwerken', 'inkomenstoeslag', 'alleenverdiener',
      'bijstand', 'uitkering', 'inkomens', 'zorg', 'welzijn', 'maatschappelijk',
      'inburgering',
    ],
  },
  {
    id: 'volksgezondheid',
    name: 'Volksgezondheid & Milieu',
    color: '#14b8a6',
    keywords: [
      'gezondheid', 'milieu', 'hygiëne', 'luchtkwaliteit', 'bodem',
      'duurzaamheid', 'energie', 'klimaat', 'water',
    ],
  },
  {
    id: 'ruimtelijk-domein',
    name: 'Ruimtelijk Domein',
    color: '#22c55e',
    keywords: [
      'ruimtelijk', 'bestemmingsplan', 'bag', 'bgt', 'geo', 'fysieke leefomgeving',
      'vergunning', 'handhaving fysieke', 'kabels', 'leiding', 'exploitatie fysieke',
      'beheren fysieke', 'realiseren fysieke', 'maken van bestekken', 'afval',
      'curatief beheer', 'preventief beheer', 'parkeer', 'vastgoed', 'geluid',
      'riolering', 'groen', 'schoonmaak', 'wro', 'beperkingenbesluiten',
    ],
  },
  {
    id: 'volkshuisvesting',
    name: 'Volkshuisvesting & Leefomgeving',
    color: '#78716c',
    keywords: [
      'wonen', 'bouwen', 'huisvest', 'stedelijk', 'ruimtelijke ordening',
      'woningbouw', 'huur', 'volkshuisvest', 'omgevingswet',
    ],
  },
  {
    id: 'verkeer-vervoer',
    name: 'Verkeer, Vervoer & Waterstaat',
    color: '#0ea5e9',
    keywords: [
      'verkeer', 'vervoer', 'waterstaat', 'haven', 'brug', 'weg',
      'fiets', 'mobiliteit', 'wegbeheer', 'straatverlichting', 'openbaar vervoer',
    ],
  },
  {
    id: 'economie',
    name: 'Economie',
    color: '#84cc16',
    keywords: [
      'economie', 'economisch', 'bedrijven', 'ondernemer', 'markt', 'straathandel',
      'toerisme', 'recreatie', 'evenement',
    ],
  },
  {
    id: 'sport-cultuur',
    name: 'Sport, Cultuur & Recreatie',
    color: '#f472b6',
    keywords: [
      'sport', 'cultuur', 'erfgoed', 'museum', 'bibliotheek', 'theater',
      'monument', 'archeolog', 'kunstwerk',
    ],
  },
  {
    id: 'financien',
    name: 'Financiën',
    color: '#ef4444',
    keywords: [
      'financ', 'begroting', 'budget', 'grootboek', 'factur', 'crediteur', 'debiteur',
      'betaling', 'salaris', 'declaratie', 'vermogen', 'activa', 'belasting',
      'inkoop', 'aanbesteding', 'bestelling', 'contract', 'leverancier', 'subsidie',
      'verantwoording',
    ],
  },
  {
    id: 'veiligheid',
    name: 'Openbare Orde & Veiligheid',
    color: '#dc2626',
    keywords: [
      'veiligheid', 'criminaliteit', 'integrale veiligheid', 'toezicht en handhaving',
      'horeca vergunning', 'alcohol', 'winkels, markt', 'handhaving', 'toezicht',
    ],
  },
  {
    id: 'dienstverlening',
    name: 'Dienstverlening',
    color: '#f97316',
    keywords: [
      'klant', 'balie', 'call center', 'kcc', 'publicatie', 'informering', 'output',
      'zoekondersteuning', 'producten- en diensten', 'open data',
      'lokale bekendmaking', 'lokale regelgeving', 'ontvangst', 'verstrekking',
      'vraag-antwoord', 'zaken en casussen', 'kennis beschikbaar',
      'klantcontact', 'zaak', 'formulier', 'website', 'portaal', 'loket',
      'indiening', 'routering',
    ],
  },
  {
    id: 'bestuur',
    name: 'Bestuur & Besluitvorming',
    color: '#ec4899',
    keywords: [
      'bestuur', 'raad', 'college', 'burgemeester', 'vergader', 'beleid',
      'programmabeheer', 'projectportfolio', 'communicatie', 'extern communicat',
      'intern communicat', 'imago', 'marketing', 'media', 'samenwerking en participatie',
      'burgerinitiatieven',
    ],
  },
  {
    id: 'ict',
    name: 'ICT',
    color: '#06b6d4',
    keywords: [
      'applicatie', 'systeem', 'automatisering', 'informatisering', 'functioneel beheer',
      'systeembeheer', 'beveiliging', 'privacy', 'autorisatie', 'architectuur',
      'gegevensmanagement', 'data-analyse', 'gegevensanalyse', 'informatie- en archief',
      'duurzaam bewaren', 'ontsluiten van informatie', 'in bewaring nemen',
      'active directory', 'server', 'netwerk', 'database', 'backup', 'monitoring',
      'licentie', 'werkplek',
    ],
  },
  {
    id: 'bedrijfsvoering',
    name: 'Bedrijfsvoering',
    color: '#a855f7',
    keywords: [
      'medewerker', 'personeel', 'werving', 'selectie', 'formatie', 'tijdregistratie',
      'ziekte', 'verlof', 'beoordeling', 'ontwikkeling', 'catering',
      'facilitair', 'goederenafhandeling', 'juridisch', 'bedrijfshulpverlening',
      'gebouwen', 'ruimtenbeveiliging', 'kantoorwerkzaamheden', 'intern afval',
      'administratieve ondersteuning',
      'informatie- en archiefbeheer', 'archief', 'kennis',
      'middeleninzet', 'projectbeheer', 'projectmanagement', 'samenwerking',
    ],
  },
];

/**
 * App-title-based classification for applications that can't be classified
 * via bedrijfsfuncties. Matches on application name patterns.
 */
const APP_TITLE_PATTERNS: Array<{ pattern: RegExp; domainId: string }> = [
  // Kantoorautomatisering → ICT
  { pattern: /acrobat|adobe|7-zip|winzip|pdf|notepad|snagit|bluebeam|photoshop|illustrator|indesign|creative cloud/i, domainId: 'ict' },
  { pattern: /^(excel|word|outlook|powerpoint|onenote|visio|project|publisher)\b/i, domainId: 'ict' },
  { pattern: /^office\b|labelstar office/i, domainId: 'ict' },
  { pattern: /chrome|firefox|powerbrowser|browser/i, domainId: 'ict' },
  { pattern: /password|zivver|passwordstate/i, domainId: 'ict' },
  // Microsoft 365 suite → ICT
  { pattern: /microsoft 365|^m365|^azure|onedrive|sharepoint online|power bi|power automate|power apps|exchange online|entra/i, domainId: 'ict' },
  { pattern: /intune|defender|endpoint|microsoft sql|oracle sql|oracle wallet|oracle workflow/i, domainId: 'ict' },
  // ICT Infrastructuur → ICT
  { pattern: /citrix|vmware|vsphere|vcenter|hyper-v|xenapp|xendesktop|netscaler/i, domainId: 'ict' },
  { pattern: /veeam|commvault|backup exec|zabbix|nagios|solarwind|prtg|lansweeper/i, domainId: 'ict' },
  { pattern: /sccm|wsus|active directory|radius|certificate|pki/i, domainId: 'ict' },
  { pattern: /fortinet|palo alto|cisco|sophos|kaspersky|mcafee|trend micro|symantec|bitdefender|crowdstrike/i, domainId: 'ict' },
  { pattern: /elasticsearch|pentaho|data integration|superset/i, domainId: 'ict' },
  // Middleware/integratie → ICT
  { pattern: /neuron esb|mulesoft|tibco|biztalk|api management/i, domainId: 'ict' },
  // GIS/Geo tools → Ruimtelijk Domein
  { pattern: /autocad|geovisia|mapublisher|arcgis|qgis|geo|gis\b/i, domainId: 'ruimtelijk-domein' },
  // Financieel → Financiën
  { pattern: /sap\b|dynamics nav|decade|erp|financials|key2financ|creditmanager/i, domainId: 'financien' },
  // HR/Personeel → Bedrijfsvoering
  { pattern: /beaufort|salaris|youforce|p-direkt|hrm/i, domainId: 'bedrijfsvoering' },
  { pattern: /topdesk|facilitair|reservering/i, domainId: 'bedrijfsvoering' },
  // Burgerzaken
  { pattern: /key2burgerzaken|key2gba|brp|burgerzaken|civision burgerzaken/i, domainId: 'burgerzaken' },
  // Sociaal domein
  { pattern: /samenlevingszaken|wmo|jeugd|schuldhulp|sociaal|bijstand|uitkering/i, domainId: 'sociaal-domein' },
  // Onderwijs
  { pattern: /onderwijs|leerling|leerplicht|school/i, domainId: 'onderwijs' },
  // Afval → Volksgezondheid
  { pattern: /afval|waste/i, domainId: 'volksgezondheid' },
];

/**
 * Classify an application by its title when function-based classification fails.
 * Uses regex patterns on the app name itself.
 */
export function classifyAppByTitle(appTitle: string): string | null {
  for (const { pattern, domainId } of APP_TITLE_PATTERNS) {
    if (pattern.test(appTitle)) return domainId;
  }
  return null;
}

export function classifyFunction(functionTitle: string): string | null {
  const lower = functionTitle.toLowerCase();
  for (const domain of GGM_DOMAINS) {
    for (const keyword of domain.keywords) {
      if (lower.includes(keyword)) return domain.id;
    }
  }
  return null;
}

export function getDomain(domainId: string): GgmDomain | undefined {
  return GGM_DOMAINS.find(d => d.id === domainId);
}
