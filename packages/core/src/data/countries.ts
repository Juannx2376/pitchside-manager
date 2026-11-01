// Las 211 asociaciones miembro de la FIFA con sus coeficientes económicos y deportivos.
//
// econ      → multiplicador económico (ESP/ENG = 1.0; COL/ARG = 0.15; ligas no competitivas = 0.02).
//             Escala TV, patrocinios, entradas, salarios, presupuestos y gastos.
// quality   → media aproximada (escala 1-99) de un titular de la primera división local.
// profile   → sesgo regional de atributos (ver attributes.ts → REGION_PROFILES).
// nameRegion→ pool de nombres usado por la generación.
// tiers     → divisiones modeladas.
// tax       → impuesto local sobre beneficios del club.
import type { RegionProfile } from '../attributes';
import type { Confederation } from '../types';

export type NameRegion =
  | 'es'
  | 'pt'
  | 'en'
  | 'fr'
  | 'it'
  | 'de'
  | 'nl'
  | 'nordic'
  | 'slav'
  | 'gr'
  | 'tr'
  | 'ar'
  | 'fa'
  | 'ja'
  | 'ko'
  | 'zh'
  | 'sea'
  | 'sa'
  | 'afw'
  | 'afe'
  | 'pac';

export interface CountryDef {
  code: string;
  name: string;
  nameEn: string;
  confederation: Confederation;
  econ: number;
  quality: number;
  profile: RegionProfile;
  nameRegion: NameRegion;
  tiers: number;
  taxRate: number;
  leagueNames: string[];
  teamsPerTier: number[];
}

type Row = [
  code: string,
  name: string,
  nameEn: string,
  confed: Confederation,
  econ: number,
  quality: number,
  profile: RegionProfile,
  nameRegion: NameRegion,
  tiers: number,
  tax: number,
];

const ROWS: Row[] = [
  // ───────────── UEFA (55) ─────────────
  ['ENG', 'Inglaterra', 'England', 'UEFA', 1.0, 76, 'british', 'en', 4, 0.25],
  ['ESP', 'España', 'Spain', 'UEFA', 1.0, 75, 'iberian', 'es', 3, 0.25],
  ['GER', 'Alemania', 'Germany', 'UEFA', 0.85, 74, 'central', 'de', 3, 0.3],
  ['ITA', 'Italia', 'Italy', 'UEFA', 0.78, 74, 'italian', 'it', 3, 0.28],
  ['FRA', 'Francia', 'France', 'UEFA', 0.65, 72, 'french', 'fr', 2, 0.25],
  ['POR', 'Portugal', 'Portugal', 'UEFA', 0.32, 69, 'iberian', 'pt', 2, 0.21],
  ['NED', 'Países Bajos', 'Netherlands', 'UEFA', 0.38, 68, 'lowlands', 'nl', 2, 0.25],
  ['BEL', 'Bélgica', 'Belgium', 'UEFA', 0.3, 67, 'lowlands', 'nl', 2, 0.25],
  ['TUR', 'Turquía', 'Türkiye', 'UEFA', 0.3, 66, 'turkic', 'tr', 2, 0.25],
  ['RUS', 'Rusia', 'Russia', 'UEFA', 0.25, 65, 'eastern', 'slav', 2, 0.2],
  ['SCO', 'Escocia', 'Scotland', 'UEFA', 0.22, 63, 'british', 'en', 2, 0.25],
  ['AUT', 'Austria', 'Austria', 'UEFA', 0.22, 64, 'central', 'de', 2, 0.24],
  ['SUI', 'Suiza', 'Switzerland', 'UEFA', 0.28, 64, 'central', 'de', 2, 0.15],
  ['GRE', 'Grecia', 'Greece', 'UEFA', 0.18, 63, 'balkan', 'gr', 2, 0.22],
  ['DEN', 'Dinamarca', 'Denmark', 'UEFA', 0.25, 64, 'nordic', 'nordic', 2, 0.22],
  ['NOR', 'Noruega', 'Norway', 'UEFA', 0.25, 61, 'nordic', 'nordic', 2, 0.22],
  ['SWE', 'Suecia', 'Sweden', 'UEFA', 0.22, 61, 'nordic', 'nordic', 2, 0.21],
  ['CZE', 'Chequia', 'Czechia', 'UEFA', 0.15, 62, 'eastern', 'slav', 2, 0.21],
  ['POL', 'Polonia', 'Poland', 'UEFA', 0.18, 62, 'eastern', 'slav', 2, 0.19],
  ['CRO', 'Croacia', 'Croatia', 'UEFA', 0.12, 63, 'balkan', 'slav', 2, 0.18],
  ['SRB', 'Serbia', 'Serbia', 'UEFA', 0.1, 62, 'balkan', 'slav', 2, 0.15],
  ['UKR', 'Ucrania', 'Ukraine', 'UEFA', 0.1, 63, 'eastern', 'slav', 2, 0.18],
  ['ROU', 'Rumanía', 'Romania', 'UEFA', 0.09, 59, 'balkan', 'slav', 2, 0.16],
  ['HUN', 'Hungría', 'Hungary', 'UEFA', 0.1, 59, 'central', 'slav', 1, 0.09],
  ['ISR', 'Israel', 'Israel', 'UEFA', 0.14, 60, 'middle_east', 'ar', 1, 0.23],
  ['CYP', 'Chipre', 'Cyprus', 'UEFA', 0.1, 60, 'balkan', 'gr', 1, 0.125],
  ['SVK', 'Eslovaquia', 'Slovakia', 'UEFA', 0.08, 58, 'eastern', 'slav', 1, 0.21],
  ['SVN', 'Eslovenia', 'Slovenia', 'UEFA', 0.07, 57, 'balkan', 'slav', 1, 0.19],
  ['BUL', 'Bulgaria', 'Bulgaria', 'UEFA', 0.07, 57, 'balkan', 'slav', 1, 0.1],
  ['KAZ', 'Kazajistán', 'Kazakhstan', 'UEFA', 0.1, 57, 'central_asia', 'slav', 1, 0.2],
  ['AZE', 'Azerbaiyán', 'Azerbaijan', 'UEFA', 0.1, 57, 'turkic', 'tr', 1, 0.2],
  ['IRL', 'Irlanda', 'Republic of Ireland', 'UEFA', 0.1, 55, 'british', 'en', 1, 0.125],
  ['NIR', 'Irlanda del Norte', 'Northern Ireland', 'UEFA', 0.05, 50, 'british', 'en', 1, 0.25],
  ['WAL', 'Gales', 'Wales', 'UEFA', 0.04, 48, 'british', 'en', 1, 0.25],
  ['FIN', 'Finlandia', 'Finland', 'UEFA', 0.08, 54, 'nordic', 'nordic', 1, 0.2],
  ['ISL', 'Islandia', 'Iceland', 'UEFA', 0.05, 52, 'nordic', 'nordic', 1, 0.2],
  ['BIH', 'Bosnia y Herzegovina', 'Bosnia and Herzegovina', 'UEFA', 0.04, 55, 'balkan', 'slav', 1, 0.1],
  ['MKD', 'Macedonia del Norte', 'North Macedonia', 'UEFA', 0.03, 52, 'balkan', 'slav', 1, 0.1],
  ['ALB', 'Albania', 'Albania', 'UEFA', 0.04, 54, 'balkan', 'slav', 1, 0.15],
  ['MNE', 'Montenegro', 'Montenegro', 'UEFA', 0.03, 52, 'balkan', 'slav', 1, 0.15],
  ['KVX', 'Kosovo', 'Kosovo', 'UEFA', 0.03, 52, 'balkan', 'slav', 1, 0.1],
  ['GEO', 'Georgia', 'Georgia', 'UEFA', 0.05, 56, 'eastern', 'slav', 1, 0.15],
  ['ARM', 'Armenia', 'Armenia', 'UEFA', 0.04, 54, 'eastern', 'slav', 1, 0.18],
  ['BLR', 'Bielorrusia', 'Belarus', 'UEFA', 0.05, 55, 'eastern', 'slav', 1, 0.2],
  ['MDA', 'Moldavia', 'Moldova', 'UEFA', 0.02, 50, 'eastern', 'slav', 1, 0.12],
  ['LVA', 'Letonia', 'Latvia', 'UEFA', 0.03, 52, 'eastern', 'slav', 1, 0.2],
  ['LTU', 'Lituania', 'Lithuania', 'UEFA', 0.03, 51, 'eastern', 'slav', 1, 0.15],
  ['EST', 'Estonia', 'Estonia', 'UEFA', 0.04, 50, 'nordic', 'nordic', 1, 0.2],
  ['LUX', 'Luxemburgo', 'Luxembourg', 'UEFA', 0.05, 50, 'french', 'fr', 1, 0.24],
  ['MLT', 'Malta', 'Malta', 'UEFA', 0.04, 49, 'italian', 'it', 1, 0.35],
  ['FRO', 'Islas Feroe', 'Faroe Islands', 'UEFA', 0.02, 45, 'nordic', 'nordic', 1, 0.18],
  ['GIB', 'Gibraltar', 'Gibraltar', 'UEFA', 0.02, 42, 'british', 'en', 1, 0.125],
  ['AND', 'Andorra', 'Andorra', 'UEFA', 0.03, 42, 'iberian', 'es', 1, 0.1],
  ['LIE', 'Liechtenstein', 'Liechtenstein', 'UEFA', 0.03, 40, 'central', 'de', 1, 0.125],
  ['SMR', 'San Marino', 'San Marino', 'UEFA', 0.02, 38, 'italian', 'it', 1, 0.17],
  // ───────────── CONMEBOL (10) ─────────────
  ['BRA', 'Brasil', 'Brazil', 'CONMEBOL', 0.3, 70, 'brazil', 'pt', 3, 0.34],
  ['ARG', 'Argentina', 'Argentina', 'CONMEBOL', 0.15, 69, 'latin_south', 'es', 2, 0.35],
  ['URU', 'Uruguay', 'Uruguay', 'CONMEBOL', 0.1, 63, 'latin_south', 'es', 2, 0.25],
  ['COL', 'Colombia', 'Colombia', 'CONMEBOL', 0.15, 64, 'andean', 'es', 2, 0.35],
  ['CHI', 'Chile', 'Chile', 'CONMEBOL', 0.12, 62, 'latin_south', 'es', 2, 0.27],
  ['ECU', 'Ecuador', 'Ecuador', 'CONMEBOL', 0.1, 62, 'andean', 'es', 2, 0.25],
  ['PAR', 'Paraguay', 'Paraguay', 'CONMEBOL', 0.08, 60, 'latin_south', 'es', 1, 0.1],
  ['PER', 'Perú', 'Peru', 'CONMEBOL', 0.08, 59, 'andean', 'es', 1, 0.295],
  ['BOL', 'Bolivia', 'Bolivia', 'CONMEBOL', 0.05, 55, 'andean', 'es', 1, 0.25],
  ['VEN', 'Venezuela', 'Venezuela', 'CONMEBOL', 0.04, 56, 'andean', 'es', 1, 0.34],
  // ───────────── CONCACAF (35) ─────────────
  ['MEX', 'México', 'Mexico', 'CONCACAF', 0.35, 66, 'central_america', 'es', 2, 0.3],
  ['USA', 'Estados Unidos', 'United States', 'CONCACAF', 0.55, 65, 'north_america', 'en', 2, 0.21],
  ['CAN', 'Canadá', 'Canada', 'CONCACAF', 0.3, 58, 'north_america', 'en', 1, 0.26],
  ['CRC', 'Costa Rica', 'Costa Rica', 'CONCACAF', 0.08, 57, 'central_america', 'es', 1, 0.3],
  ['HON', 'Honduras', 'Honduras', 'CONCACAF', 0.04, 54, 'central_america', 'es', 1, 0.25],
  ['GUA', 'Guatemala', 'Guatemala', 'CONCACAF', 0.04, 52, 'central_america', 'es', 1, 0.25],
  ['SLV', 'El Salvador', 'El Salvador', 'CONCACAF', 0.03, 51, 'central_america', 'es', 1, 0.3],
  ['PAN', 'Panamá', 'Panama', 'CONCACAF', 0.05, 54, 'central_america', 'es', 1, 0.25],
  ['JAM', 'Jamaica', 'Jamaica', 'CONCACAF', 0.04, 52, 'caribbean', 'en', 1, 0.25],
  ['TRI', 'Trinidad y Tobago', 'Trinidad and Tobago', 'CONCACAF', 0.03, 50, 'caribbean', 'en', 1, 0.3],
  ['HAI', 'Haití', 'Haiti', 'CONCACAF', 0.02, 48, 'caribbean', 'fr', 1, 0.3],
  ['CUB', 'Cuba', 'Cuba', 'CONCACAF', 0.02, 46, 'caribbean', 'es', 1, 0.35],
  ['DOM', 'República Dominicana', 'Dominican Republic', 'CONCACAF', 0.02, 46, 'caribbean', 'es', 1, 0.27],
  ['NCA', 'Nicaragua', 'Nicaragua', 'CONCACAF', 0.02, 46, 'central_america', 'es', 1, 0.3],
  ['SUR', 'Surinam', 'Suriname', 'CONCACAF', 0.02, 45, 'caribbean', 'nl', 1, 0.36],
  ['GUY', 'Guyana', 'Guyana', 'CONCACAF', 0.02, 42, 'caribbean', 'en', 1, 0.25],
  ['CUW', 'Curazao', 'Curaçao', 'CONCACAF', 0.02, 46, 'caribbean', 'nl', 1, 0.22],
  ['PUR', 'Puerto Rico', 'Puerto Rico', 'CONCACAF', 0.03, 44, 'caribbean', 'es', 1, 0.375],
  ['BLZ', 'Belice', 'Belize', 'CONCACAF', 0.02, 40, 'central_america', 'en', 1, 0.25],
  ['BER', 'Bermudas', 'Bermuda', 'CONCACAF', 0.03, 41, 'caribbean', 'en', 1, 0.0],
  ['BAH', 'Bahamas', 'Bahamas', 'CONCACAF', 0.02, 36, 'caribbean', 'en', 1, 0.0],
  ['BRB', 'Barbados', 'Barbados', 'CONCACAF', 0.02, 38, 'caribbean', 'en', 1, 0.09],
  ['ATG', 'Antigua y Barbuda', 'Antigua and Barbuda', 'CONCACAF', 0.02, 38, 'caribbean', 'en', 1, 0.25],
  ['LCA', 'Santa Lucía', 'Saint Lucia', 'CONCACAF', 0.02, 37, 'caribbean', 'en', 1, 0.3],
  ['VIN', 'San Vicente y las Granadinas', 'Saint Vincent and the Grenadines', 'CONCACAF', 0.02, 37, 'caribbean', 'en', 1, 0.3],
  ['GRN', 'Granada', 'Grenada', 'CONCACAF', 0.02, 38, 'caribbean', 'en', 1, 0.28],
  ['DMA', 'Dominica', 'Dominica', 'CONCACAF', 0.02, 36, 'caribbean', 'en', 1, 0.25],
  ['SKN', 'San Cristóbal y Nieves', 'Saint Kitts and Nevis', 'CONCACAF', 0.02, 38, 'caribbean', 'en', 1, 0.33],
  ['ARU', 'Aruba', 'Aruba', 'CONCACAF', 0.02, 38, 'caribbean', 'nl', 1, 0.25],
  ['CAY', 'Islas Caimán', 'Cayman Islands', 'CONCACAF', 0.02, 35, 'caribbean', 'en', 1, 0.0],
  ['TCA', 'Islas Turcas y Caicos', 'Turks and Caicos Islands', 'CONCACAF', 0.02, 32, 'caribbean', 'en', 1, 0.0],
  ['AIA', 'Anguila', 'Anguilla', 'CONCACAF', 0.02, 30, 'caribbean', 'en', 1, 0.0],
  ['MSR', 'Montserrat', 'Montserrat', 'CONCACAF', 0.02, 31, 'caribbean', 'en', 1, 0.3],
  ['VGB', 'Islas Vírgenes Británicas', 'British Virgin Islands', 'CONCACAF', 0.02, 31, 'caribbean', 'en', 1, 0.0],
  ['VIR', 'Islas Vírgenes de EE. UU.', 'US Virgin Islands', 'CONCACAF', 0.02, 31, 'caribbean', 'en', 1, 0.21],
  // ───────────── CAF (54) ─────────────
  ['MAR', 'Marruecos', 'Morocco', 'CAF', 0.09, 61, 'north_africa', 'ar', 1, 0.31],
  ['EGY', 'Egipto', 'Egypt', 'CAF', 0.09, 60, 'north_africa', 'ar', 1, 0.225],
  ['RSA', 'Sudáfrica', 'South Africa', 'CAF', 0.1, 59, 'east_south_africa', 'afe', 1, 0.27],
  ['ALG', 'Argelia', 'Algeria', 'CAF', 0.07, 58, 'north_africa', 'ar', 1, 0.26],
  ['TUN', 'Túnez', 'Tunisia', 'CAF', 0.06, 58, 'north_africa', 'ar', 1, 0.15],
  ['NGA', 'Nigeria', 'Nigeria', 'CAF', 0.05, 57, 'west_africa', 'afw', 1, 0.3],
  ['GHA', 'Ghana', 'Ghana', 'CAF', 0.04, 56, 'west_africa', 'afw', 1, 0.25],
  ['SEN', 'Senegal', 'Senegal', 'CAF', 0.04, 56, 'west_africa', 'fr', 1, 0.3],
  ['CIV', 'Costa de Marfil', 'Ivory Coast', 'CAF', 0.04, 56, 'west_africa', 'fr', 1, 0.25],
  ['CMR', 'Camerún', 'Cameroon', 'CAF', 0.04, 55, 'west_africa', 'fr', 1, 0.33],
  ['COD', 'RD del Congo', 'DR Congo', 'CAF', 0.04, 56, 'west_africa', 'fr', 1, 0.3],
  ['MLI', 'Malí', 'Mali', 'CAF', 0.03, 54, 'west_africa', 'fr', 1, 0.3],
  ['TAN', 'Tanzania', 'Tanzania', 'CAF', 0.04, 54, 'east_south_africa', 'afe', 1, 0.3],
  ['ANG', 'Angola', 'Angola', 'CAF', 0.04, 53, 'east_south_africa', 'pt', 1, 0.25],
  ['ZAM', 'Zambia', 'Zambia', 'CAF', 0.03, 53, 'east_south_africa', 'afe', 1, 0.3],
  ['KEN', 'Kenia', 'Kenya', 'CAF', 0.03, 51, 'east_south_africa', 'afe', 1, 0.3],
  ['UGA', 'Uganda', 'Uganda', 'CAF', 0.03, 52, 'east_south_africa', 'afe', 1, 0.3],
  ['ZIM', 'Zimbabue', 'Zimbabwe', 'CAF', 0.02, 51, 'east_south_africa', 'afe', 1, 0.24],
  ['BFA', 'Burkina Faso', 'Burkina Faso', 'CAF', 0.02, 52, 'west_africa', 'fr', 1, 0.275],
  ['GUI', 'Guinea', 'Guinea', 'CAF', 0.02, 52, 'west_africa', 'fr', 1, 0.35],
  ['BEN', 'Benín', 'Benin', 'CAF', 0.02, 50, 'west_africa', 'fr', 1, 0.3],
  ['GAB', 'Gabón', 'Gabon', 'CAF', 0.03, 50, 'west_africa', 'fr', 1, 0.3],
  ['CPV', 'Cabo Verde', 'Cape Verde', 'CAF', 0.02, 50, 'west_africa', 'pt', 1, 0.22],
  ['LBY', 'Libia', 'Libya', 'CAF', 0.04, 52, 'north_africa', 'ar', 1, 0.2],
  ['SDN', 'Sudán', 'Sudan', 'CAF', 0.03, 51, 'north_africa', 'ar', 1, 0.35],
  ['ETH', 'Etiopía', 'Ethiopia', 'CAF', 0.02, 50, 'east_south_africa', 'afe', 1, 0.3],
  ['MOZ', 'Mozambique', 'Mozambique', 'CAF', 0.02, 50, 'east_south_africa', 'pt', 1, 0.32],
  ['NAM', 'Namibia', 'Namibia', 'CAF', 0.02, 49, 'east_south_africa', 'afe', 1, 0.32],
  ['BOT', 'Botsuana', 'Botswana', 'CAF', 0.03, 48, 'east_south_africa', 'afe', 1, 0.22],
  ['MWI', 'Malaui', 'Malawi', 'CAF', 0.02, 49, 'east_south_africa', 'afe', 1, 0.3],
  ['RWA', 'Ruanda', 'Rwanda', 'CAF', 0.02, 50, 'east_south_africa', 'afe', 1, 0.3],
  ['MAD', 'Madagascar', 'Madagascar', 'CAF', 0.02, 49, 'east_south_africa', 'fr', 1, 0.2],
  ['MTN', 'Mauritania', 'Mauritania', 'CAF', 0.02, 49, 'north_africa', 'ar', 1, 0.25],
  ['NIG', 'Níger', 'Niger', 'CAF', 0.02, 47, 'west_africa', 'fr', 1, 0.3],
  ['TOG', 'Togo', 'Togo', 'CAF', 0.02, 49, 'west_africa', 'fr', 1, 0.27],
  ['GAM', 'Gambia', 'Gambia', 'CAF', 0.02, 49, 'west_africa', 'afw', 1, 0.27],
  ['SLE', 'Sierra Leona', 'Sierra Leone', 'CAF', 0.02, 47, 'west_africa', 'afw', 1, 0.25],
  ['LBR', 'Liberia', 'Liberia', 'CAF', 0.02, 46, 'west_africa', 'afw', 1, 0.25],
  ['CGO', 'Congo', 'Congo', 'CAF', 0.02, 49, 'west_africa', 'fr', 1, 0.28],
  ['EQG', 'Guinea Ecuatorial', 'Equatorial Guinea', 'CAF', 0.03, 48, 'west_africa', 'es', 1, 0.35],
  ['CTA', 'República Centroafricana', 'Central African Republic', 'CAF', 0.02, 46, 'west_africa', 'fr', 1, 0.3],
  ['CHA', 'Chad', 'Chad', 'CAF', 0.02, 44, 'west_africa', 'fr', 1, 0.35],
  ['BDI', 'Burundi', 'Burundi', 'CAF', 0.02, 47, 'east_south_africa', 'afe', 1, 0.3],
  ['GNB', 'Guinea-Bisáu', 'Guinea-Bissau', 'CAF', 0.02, 47, 'west_africa', 'pt', 1, 0.25],
  ['COM', 'Comoras', 'Comoros', 'CAF', 0.02, 46, 'east_south_africa', 'fr', 1, 0.35],
  ['LES', 'Lesoto', 'Lesotho', 'CAF', 0.02, 45, 'east_south_africa', 'afe', 1, 0.25],
  ['SWZ', 'Esuatini', 'Eswatini', 'CAF', 0.02, 45, 'east_south_africa', 'afe', 1, 0.275],
  ['MRI', 'Mauricio', 'Mauritius', 'CAF', 0.02, 42, 'east_south_africa', 'en', 1, 0.15],
  ['SEY', 'Seychelles', 'Seychelles', 'CAF', 0.02, 38, 'east_south_africa', 'en', 1, 0.25],
  ['DJI', 'Yibuti', 'Djibouti', 'CAF', 0.02, 38, 'east_south_africa', 'fr', 1, 0.25],
  ['ERI', 'Eritrea', 'Eritrea', 'CAF', 0.02, 38, 'east_south_africa', 'afe', 1, 0.3],
  ['SOM', 'Somalia', 'Somalia', 'CAF', 0.02, 36, 'east_south_africa', 'ar', 1, 0.3],
  ['SSD', 'Sudán del Sur', 'South Sudan', 'CAF', 0.02, 40, 'east_south_africa', 'afe', 1, 0.3],
  ['STP', 'Santo Tomé y Príncipe', 'São Tomé and Príncipe', 'CAF', 0.02, 37, 'west_africa', 'pt', 1, 0.25],
  // ───────────── AFC (46) ─────────────
  ['KSA', 'Arabia Saudí', 'Saudi Arabia', 'AFC', 0.6, 66, 'middle_east', 'ar', 2, 0.2],
  ['JPN', 'Japón', 'Japan', 'AFC', 0.35, 65, 'east_asia', 'ja', 2, 0.3],
  ['KOR', 'Corea del Sur', 'Korea Republic', 'AFC', 0.28, 64, 'east_asia', 'ko', 2, 0.24],
  ['AUS', 'Australia', 'Australia', 'AFC', 0.3, 61, 'oceania', 'en', 1, 0.3],
  ['QAT', 'Catar', 'Qatar', 'AFC', 0.35, 60, 'middle_east', 'ar', 1, 0.1],
  ['UAE', 'Emiratos Árabes Unidos', 'United Arab Emirates', 'AFC', 0.3, 60, 'middle_east', 'ar', 1, 0.09],
  ['CHN', 'China', 'China PR', 'AFC', 0.25, 60, 'east_asia', 'zh', 2, 0.25],
  ['IRN', 'Irán', 'IR Iran', 'AFC', 0.07, 60, 'middle_east', 'fa', 1, 0.25],
  ['UZB', 'Uzbekistán', 'Uzbekistan', 'AFC', 0.05, 57, 'central_asia', 'slav', 1, 0.15],
  ['IRQ', 'Irak', 'Iraq', 'AFC', 0.05, 56, 'middle_east', 'ar', 1, 0.15],
  ['THA', 'Tailandia', 'Thailand', 'AFC', 0.07, 55, 'southeast_asia', 'sea', 1, 0.2],
  ['IDN', 'Indonesia', 'Indonesia', 'AFC', 0.06, 54, 'southeast_asia', 'sea', 1, 0.22],
  ['VIE', 'Vietnam', 'Vietnam', 'AFC', 0.05, 54, 'southeast_asia', 'sea', 1, 0.2],
  ['JOR', 'Jordania', 'Jordan', 'AFC', 0.04, 54, 'middle_east', 'ar', 1, 0.2],
  ['MAS', 'Malasia', 'Malaysia', 'AFC', 0.06, 53, 'southeast_asia', 'sea', 1, 0.24],
  ['SYR', 'Siria', 'Syria', 'AFC', 0.02, 53, 'middle_east', 'ar', 1, 0.22],
  ['KUW', 'Kuwait', 'Kuwait', 'AFC', 0.08, 52, 'middle_east', 'ar', 1, 0.15],
  ['OMA', 'Omán', 'Oman', 'AFC', 0.05, 52, 'middle_east', 'ar', 1, 0.15],
  ['IND', 'India', 'India', 'AFC', 0.06, 52, 'south_asia', 'sa', 1, 0.25],
  ['BHR', 'Baréin', 'Bahrain', 'AFC', 0.06, 51, 'middle_east', 'ar', 1, 0.0],
  ['LBN', 'Líbano', 'Lebanon', 'AFC', 0.02, 50, 'middle_east', 'ar', 1, 0.17],
  ['PLE', 'Palestina', 'Palestine', 'AFC', 0.02, 50, 'middle_east', 'ar', 1, 0.15],
  ['TJK', 'Tayikistán', 'Tajikistan', 'AFC', 0.02, 50, 'central_asia', 'slav', 1, 0.18],
  ['PRK', 'Corea del Norte', 'Korea DPR', 'AFC', 0.02, 50, 'east_asia', 'ko', 1, 0.25],
  ['KGZ', 'Kirguistán', 'Kyrgyz Republic', 'AFC', 0.02, 49, 'central_asia', 'slav', 1, 0.1],
  ['TKM', 'Turkmenistán', 'Turkmenistan', 'AFC', 0.02, 49, 'central_asia', 'tr', 1, 0.08],
  ['SIN', 'Singapur', 'Singapore', 'AFC', 0.06, 48, 'southeast_asia', 'sea', 1, 0.17],
  ['HKG', 'Hong Kong', 'Hong Kong, China', 'AFC', 0.05, 48, 'east_asia', 'zh', 1, 0.165],
  ['YEM', 'Yemen', 'Yemen', 'AFC', 0.02, 47, 'middle_east', 'ar', 1, 0.2],
  ['MYA', 'Myanmar', 'Myanmar', 'AFC', 0.02, 47, 'southeast_asia', 'sea', 1, 0.22],
  ['PHI', 'Filipinas', 'Philippines', 'AFC', 0.03, 46, 'southeast_asia', 'sea', 1, 0.25],
  ['CAM', 'Camboya', 'Cambodia', 'AFC', 0.02, 45, 'southeast_asia', 'sea', 1, 0.2],
  ['TPE', 'China Taipéi', 'Chinese Taipei', 'AFC', 0.03, 44, 'east_asia', 'zh', 1, 0.2],
  ['BAN', 'Bangladés', 'Bangladesh', 'AFC', 0.02, 44, 'south_asia', 'sa', 1, 0.275],
  ['LAO', 'Laos', 'Laos', 'AFC', 0.02, 42, 'southeast_asia', 'sea', 1, 0.2],
  ['NEP', 'Nepal', 'Nepal', 'AFC', 0.02, 42, 'south_asia', 'sa', 1, 0.25],
  ['AFG', 'Afganistán', 'Afghanistan', 'AFC', 0.02, 42, 'central_asia', 'fa', 1, 0.2],
  ['MDV', 'Maldivas', 'Maldives', 'AFC', 0.02, 40, 'south_asia', 'sa', 1, 0.15],
  ['SRI', 'Sri Lanka', 'Sri Lanka', 'AFC', 0.02, 38, 'south_asia', 'sa', 1, 0.3],
  ['PAK', 'Pakistán', 'Pakistan', 'AFC', 0.02, 38, 'south_asia', 'sa', 1, 0.29],
  ['MNG', 'Mongolia', 'Mongolia', 'AFC', 0.02, 38, 'central_asia', 'slav', 1, 0.25],
  ['MAC', 'Macao', 'Macau', 'AFC', 0.03, 36, 'east_asia', 'zh', 1, 0.12],
  ['BRU', 'Brunéi', 'Brunei Darussalam', 'AFC', 0.03, 36, 'southeast_asia', 'sea', 1, 0.185],
  ['BHU', 'Bután', 'Bhutan', 'AFC', 0.02, 35, 'south_asia', 'sa', 1, 0.3],
  ['TLS', 'Timor Oriental', 'Timor-Leste', 'AFC', 0.02, 35, 'southeast_asia', 'pt', 1, 0.1],
  ['GUM', 'Guam', 'Guam', 'AFC', 0.02, 33, 'oceania', 'pac', 1, 0.21],
  // ───────────── OFC (11) ─────────────
  ['NZL', 'Nueva Zelanda', 'New Zealand', 'OFC', 0.25, 55, 'oceania', 'en', 1, 0.28],
  ['FIJ', 'Fiyi', 'Fiji', 'OFC', 0.02, 44, 'oceania', 'pac', 1, 0.2],
  ['NCL', 'Nueva Caledonia', 'New Caledonia', 'OFC', 0.03, 44, 'oceania', 'fr', 1, 0.3],
  ['TAH', 'Tahití', 'Tahiti', 'OFC', 0.03, 43, 'oceania', 'fr', 1, 0.27],
  ['SOL', 'Islas Salomón', 'Solomon Islands', 'OFC', 0.02, 42, 'oceania', 'pac', 1, 0.3],
  ['PNG', 'Papúa Nueva Guinea', 'Papua New Guinea', 'OFC', 0.02, 40, 'oceania', 'pac', 1, 0.3],
  ['VAN', 'Vanuatu', 'Vanuatu', 'OFC', 0.02, 40, 'oceania', 'pac', 1, 0.0],
  ['SAM', 'Samoa', 'Samoa', 'OFC', 0.02, 34, 'oceania', 'pac', 1, 0.27],
  ['COK', 'Islas Cook', 'Cook Islands', 'OFC', 0.02, 32, 'oceania', 'pac', 1, 0.2],
  ['TGA', 'Tonga', 'Tonga', 'OFC', 0.02, 31, 'oceania', 'pac', 1, 0.25],
  ['ASA', 'Samoa Americana', 'American Samoa', 'OFC', 0.02, 30, 'oceania', 'pac', 1, 0.21],
];

/** Código ISO 3166-1 alfa-2 (minúsculas, formato flagcdn) por código FIFA. */
export const ISO2: Record<string, string> = {
  ENG: 'gb-eng', ESP: 'es', GER: 'de', ITA: 'it', FRA: 'fr', POR: 'pt', NED: 'nl', BEL: 'be', TUR: 'tr', RUS: 'ru', SCO: 'gb-sct', AUT: 'at',
  SUI: 'ch', GRE: 'gr', DEN: 'dk', NOR: 'no', SWE: 'se', CZE: 'cz', POL: 'pl', CRO: 'hr', SRB: 'rs', UKR: 'ua', ROU: 'ro', HUN: 'hu',
  ISR: 'il', CYP: 'cy', SVK: 'sk', SVN: 'si', BUL: 'bg', KAZ: 'kz', AZE: 'az', IRL: 'ie', NIR: 'gb-nir', WAL: 'gb-wls', FIN: 'fi', ISL: 'is',
  BIH: 'ba', MKD: 'mk', ALB: 'al', MNE: 'me', KVX: 'xk', GEO: 'ge', ARM: 'am', BLR: 'by', MDA: 'md', LVA: 'lv', LTU: 'lt', EST: 'ee',
  LUX: 'lu', MLT: 'mt', FRO: 'fo', GIB: 'gi', AND: 'ad', LIE: 'li', SMR: 'sm',
  BRA: 'br', ARG: 'ar', URU: 'uy', COL: 'co', CHI: 'cl', ECU: 'ec', PAR: 'py', PER: 'pe', BOL: 'bo', VEN: 've',
  MEX: 'mx', USA: 'us', CAN: 'ca', CRC: 'cr', HON: 'hn', GUA: 'gt', SLV: 'sv', PAN: 'pa', JAM: 'jm', TRI: 'tt', HAI: 'ht', CUB: 'cu',
  DOM: 'do', NCA: 'ni', SUR: 'sr', GUY: 'gy', CUW: 'cw', PUR: 'pr', BLZ: 'bz', BER: 'bm', BAH: 'bs', BRB: 'bb', ATG: 'ag', LCA: 'lc',
  VIN: 'vc', GRN: 'gd', DMA: 'dm', SKN: 'kn', ARU: 'aw', CAY: 'ky', TCA: 'tc', AIA: 'ai', MSR: 'ms', VGB: 'vg', VIR: 'vi',
  MAR: 'ma', EGY: 'eg', RSA: 'za', ALG: 'dz', TUN: 'tn', NGA: 'ng', GHA: 'gh', SEN: 'sn', CIV: 'ci', CMR: 'cm', COD: 'cd', MLI: 'ml',
  TAN: 'tz', ANG: 'ao', ZAM: 'zm', KEN: 'ke', UGA: 'ug', ZIM: 'zw', BFA: 'bf', GUI: 'gn', BEN: 'bj', GAB: 'ga', CPV: 'cv', LBY: 'ly',
  SDN: 'sd', ETH: 'et', MOZ: 'mz', NAM: 'na', BOT: 'bw', MWI: 'mw', RWA: 'rw', MAD: 'mg', MTN: 'mr', NIG: 'ne', TOG: 'tg', GAM: 'gm',
  SLE: 'sl', LBR: 'lr', CGO: 'cg', EQG: 'gq', CTA: 'cf', CHA: 'td', BDI: 'bi', GNB: 'gw', COM: 'km', LES: 'ls', SWZ: 'sz', MRI: 'mu',
  SEY: 'sc', DJI: 'dj', ERI: 'er', SOM: 'so', SSD: 'ss', STP: 'st',
  KSA: 'sa', JPN: 'jp', KOR: 'kr', AUS: 'au', QAT: 'qa', UAE: 'ae', CHN: 'cn', IRN: 'ir', UZB: 'uz', IRQ: 'iq', THA: 'th', IDN: 'id',
  VIE: 'vn', JOR: 'jo', MAS: 'my', SYR: 'sy', KUW: 'kw', OMA: 'om', IND: 'in', BHR: 'bh', LBN: 'lb', PLE: 'ps', TJK: 'tj', PRK: 'kp',
  KGZ: 'kg', TKM: 'tm', SIN: 'sg', HKG: 'hk', YEM: 'ye', MYA: 'mm', PHI: 'ph', CAM: 'kh', TPE: 'tw', BAN: 'bd', LAO: 'la', NEP: 'np',
  AFG: 'af', MDV: 'mv', SRI: 'lk', PAK: 'pk', MNG: 'mn', MAC: 'mo', BRU: 'bn', BHU: 'bt', TLS: 'tl', GUM: 'gu',
  NZL: 'nz', FIJ: 'fj', NCL: 'nc', TAH: 'pf', SOL: 'sb', PNG: 'pg', VAN: 'vu', SAM: 'ws', COK: 'ck', TGA: 'to', ASA: 'as',
};

export function flagUrl(code: string, width = 40): string {
  const iso = ISO2[code];
  return iso ? `https://flagcdn.com/w${width}/${iso}.png` : '';
}

/** Nombres reales de divisiones (el resto se nombra genéricamente). */
const LEAGUE_NAMES: Record<string, string[]> = {
  ENG: ['Premier League', 'EFL Championship', 'EFL League One', 'EFL League Two'],
  ESP: ['LaLiga EA Sports', 'LaLiga Hypermotion', 'Primera Federación'],
  GER: ['Bundesliga', '2. Bundesliga', '3. Liga'],
  ITA: ['Serie A', 'Serie B', 'Serie C'],
  FRA: ['Ligue 1', 'Ligue 2'],
  POR: ['Liga Portugal', 'Liga Portugal 2'],
  NED: ['Eredivisie', 'Eerste Divisie'],
  BEL: ['Jupiler Pro League', 'Challenger Pro League'],
  TUR: ['Süper Lig', '1. Lig'],
  RUS: ['Premier Liga', 'Pervaya Liga'],
  SCO: ['Scottish Premiership', 'Scottish Championship'],
  AUT: ['Admiral Bundesliga', '2. Liga'],
  SUI: ['Super League', 'Challenge League'],
  GRE: ['Super League Greece', 'Super League 2'],
  DEN: ['Superliga', '1. Division'],
  NOR: ['Eliteserien', 'OBOS-ligaen'],
  SWE: ['Allsvenskan', 'Superettan'],
  CZE: ['Chance Liga', 'Fortuna národní liga'],
  POL: ['Ekstraklasa', 'I liga'],
  CRO: ['HNL', 'Prva NL'],
  SRB: ['SuperLiga', 'Prva Liga'],
  UKR: ['Premier Liha', 'Persha Liha'],
  ROU: ['Superliga', 'Liga II'],
  BRA: ['Brasileirão Série A', 'Brasileirão Série B', 'Brasileirão Série C'],
  ARG: ['Liga Profesional', 'Primera Nacional'],
  URU: ['Liga AUF Uruguaya', 'Segunda División'],
  COL: ['Liga BetPlay DIMAYOR', 'Torneo BetPlay DIMAYOR'],
  CHI: ['Liga de Primera', 'Primera B'],
  ECU: ['LigaPro Serie A', 'LigaPro Serie B'],
  PAR: ['División de Honor'],
  PER: ['Liga 1'],
  BOL: ['División Profesional'],
  VEN: ['Liga FUTVE'],
  MEX: ['Liga MX', 'Liga de Expansión MX'],
  USA: ['Major League Soccer', 'USL Championship'],
  CAN: ['Canadian Premier League'],
  CRC: ['Liga Promerica'],
  KSA: ['Saudi Pro League', 'First Division League'],
  JPN: ['J1 League', 'J2 League'],
  KOR: ['K League 1', 'K League 2'],
  CHN: ['Chinese Super League', 'China League One'],
  AUS: ['A-League Men'],
  QAT: ['Qatar Stars League'],
  UAE: ['UAE Pro League'],
  IRN: ['Persian Gulf Pro League'],
  EGY: ['Egyptian Premier League'],
  MAR: ['Botola Pro'],
  RSA: ['Betway Premiership'],
  ALG: ['Ligue Professionnelle 1'],
  TUN: ['Ligue Professionnelle 1'],
  NGA: ['Nigeria Premier Football League'],
  NZL: ['National League'],
};

const TEAMS_PER_TIER: Record<string, number[]> = {
  ENG: [20, 24, 24, 24],
  ESP: [20, 22, 20],
  GER: [18, 18, 20],
  ITA: [20, 20, 20],
  FRA: [18, 18],
  BRA: [20, 20, 20],
  ARG: [20, 18],
  KSA: [18, 18],
};

function defaultTeams(quality: number): number {
  if (quality >= 64) return 18;
  if (quality >= 58) return 16;
  if (quality >= 50) return 12;
  if (quality >= 40) return 10;
  return 8;
}


export const COUNTRIES: CountryDef[] = ROWS.map(([code, name, nameEn, confederation, econ, quality, profile, nameRegion, tiers, taxRate]) => {
  const names = LEAGUE_NAMES[code] ?? [];
  const leagueNames: string[] = [];
  const teamsPerTier: number[] = [];
  for (let t = 0; t < tiers; t++) {
    // Cadena vacía = sin nombre real: se muestra un nombre genérico traducible ("Primera División de X").
    leagueNames.push(names[t] ?? '');
    teamsPerTier.push(TEAMS_PER_TIER[code]?.[t] ?? defaultTeams(quality));
  }
  return { code, name, nameEn, confederation, econ, quality, profile, nameRegion, tiers, taxRate, leagueNames, teamsPerTier };
});

export const COUNTRY_BY_CODE: Record<string, CountryDef> = Object.fromEntries(COUNTRIES.map((c) => [c.code, c]));

const COUNTRY_ALIASES: Record<string, string> = {
  'korea republic': 'KOR',
  'south korea': 'KOR',
  'republic of korea': 'KOR',
  'korea dpr': 'PRK',
  'north korea': 'PRK',
  'china pr': 'CHN',
  china: 'CHN',
  'ir iran': 'IRN',
  iran: 'IRN',
  'united states': 'USA',
  usa: 'USA',
  'united states of america': 'USA',
  'czech republic': 'CZE',
  czechia: 'CZE',
  turkey: 'TUR',
  türkiye: 'TUR',
  'ivory coast': 'CIV',
  "côte d'ivoire": 'CIV',
  "cote d'ivoire": 'CIV',
  'dr congo': 'COD',
  'congo dr': 'COD',
  'republic of ireland': 'IRL',
  ireland: 'IRL',
  holland: 'NED',
  netherlands: 'NED',
  'bosnia herzegovina': 'BIH',
  'bosnia and herzegovina': 'BIH',
  'cape verde islands': 'CPV',
  'cabo verde': 'CPV',
  'kyrgyzstan': 'KGZ',
  'macedonia': 'MKD',
  'fyr macedonia': 'MKD',
  'curacao': 'CUW',
  'st kitts and nevis': 'SKN',
  'st lucia': 'LCA',
  'st vincent and the grenadines': 'VIN',
  'guinea bissau': 'GNB',
  'sao tome e principe': 'STP',
  'swaziland': 'SWZ',
  'chinese taipei': 'TPE',
  'brunei': 'BRU',
  'east timor': 'TLS',
  'uae': 'UAE',
  'kosovo': 'KVX',
};

/** Resuelve un nombre de país (español, inglés, alias o código FIFA) a su código. */
export function resolveCountryCode(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  const upper = s.toUpperCase();
  if (COUNTRY_BY_CODE[upper]) return upper;
  const lower = s.toLowerCase();
  if (COUNTRY_ALIASES[lower]) return COUNTRY_ALIASES[lower];
  for (const c of COUNTRIES) {
    if (c.name.toLowerCase() === lower || c.nameEn.toLowerCase() === lower) return c.code;
  }
  return null;
}

/** Reputación de liga 0-100 derivada de calidad, economía y nivel. */
export function leagueReputation(country: CountryDef, tier: number): number {
  const base = (country.quality - 30) * 1.55 + Math.sqrt(country.econ) * 18;
  return Math.max(1, Math.min(100, Math.round(base - tier * 14)));
}
