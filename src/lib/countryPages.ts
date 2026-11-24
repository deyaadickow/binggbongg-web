// Country pages for search (Steve, 2026-11-23, free marketing: "All the free ideas" → "Go").
// One crawlable page per country running the hourly Country Battle: /country-battle/<slug>.
// Shared by seo.config.ts (writes the static HTML at build time) and the React page that replaces
// it, so the words can never differ. No money / prize / casino wording: Meta and the stores read
// these pages (see the "social casino" note in seo.config.ts).
//
// name = the server's country name (what fetchAllCountryBattles and the battles carry);
// display = how a person writes it. All 197 rows = every battle country on 2026-11-23.

export interface CountryPage { name: string; display: string; slug: string; code: string; tz: string }

const ROWS: [string, string, string, string, string][] = [
  ["Afghanistan", "Afghanistan", "afghanistan", "AF", "Asia/Kabul"],
  ["Albania", "Albania", "albania", "AL", "Europe/Tirane"],
  ["Algeria", "Algeria", "algeria", "DZ", "Africa/Algiers"],
  ["Andorra", "Andorra", "andorra", "AD", "Europe/Andorra"],
  ["Angola", "Angola", "angola", "AO", "Africa/Luanda"],
  ["Antigua And Barbuda", "Antigua and Barbuda", "antigua-and-barbuda", "AG", "America/Antigua"],
  ["Argentina", "Argentina", "argentina", "AR", "America/Argentina/Buenos_Aires"],
  ["Armenia", "Armenia", "armenia", "AM", "Asia/Yerevan"],
  ["Australia", "Australia", "australia", "AU", "Australia/Sydney"],
  ["Austria", "Austria", "austria", "AT", "Europe/Vienna"],
  ["Azerbaijan", "Azerbaijan", "azerbaijan", "AZ", "Asia/Baku"],
  ["Bahamas The", "The Bahamas", "the-bahamas", "BS", "America/Nassau"],
  ["Bahrain", "Bahrain", "bahrain", "BH", "Asia/Bahrain"],
  ["Bangladesh", "Bangladesh", "bangladesh", "BD", "Asia/Dhaka"],
  ["Barbados", "Barbados", "barbados", "BB", "America/Barbados"],
  ["Belarus", "Belarus", "belarus", "BY", "Europe/Minsk"],
  ["Belgium", "Belgium", "belgium", "BE", "Europe/Brussels"],
  ["Belize", "Belize", "belize", "BZ", "America/Belize"],
  ["Benin", "Benin", "benin", "BJ", "Africa/Porto-Novo"],
  ["Bermuda", "Bermuda", "bermuda", "BM", "Atlantic/Bermuda"],
  ["Bhutan", "Bhutan", "bhutan", "BT", "Asia/Thimphu"],
  ["Bolivia", "Bolivia", "bolivia", "BO", "America/La_Paz"],
  ["Bosnia and Herzegovina", "Bosnia and Herzegovina", "bosnia-and-herzegovina", "BA", "Europe/Sarajevo"],
  ["Botswana", "Botswana", "botswana", "BW", "Africa/Gaborone"],
  ["Brazil", "Brazil", "brazil", "BR", "America/Sao_Paulo"],
  ["Brunei", "Brunei", "brunei", "BN", "Asia/Brunei"],
  ["Bulgaria", "Bulgaria", "bulgaria", "BG", "Europe/Sofia"],
  ["Burkina Faso", "Burkina Faso", "burkina-faso", "BF", "Africa/Ouagadougou"],
  ["Burundi", "Burundi", "burundi", "BI", "Africa/Bujumbura"],
  ["Cambodia", "Cambodia", "cambodia", "KH", "Asia/Phnom_Penh"],
  ["Cameroon", "Cameroon", "cameroon", "CM", "Africa/Douala"],
  ["Canada", "Canada", "canada", "CA", "America/Toronto"],
  ["Cape Verde", "Cape Verde", "cape-verde", "CV", "Atlantic/Cape_Verde"],
  ["Central African Republic", "Central African Republic", "central-african-republic", "CF", "Africa/Bangui"],
  ["Chad", "Chad", "chad", "TD", "Africa/Ndjamena"],
  ["Chile", "Chile", "chile", "CL", "America/Santiago"],
  ["China", "China", "china", "CN", "Asia/Shanghai"],
  ["Colombia", "Colombia", "colombia", "CO", "America/Bogota"],
  ["Comoros", "Comoros", "comoros", "KM", "Indian/Comoro"],
  ["Costa Rica", "Costa Rica", "costa-rica", "CR", "America/Costa_Rica"],
  ["Croatia (Hrvatska)", "Croatia", "croatia", "HR", "Europe/Zagreb"],
  ["Cuba", "Cuba", "cuba", "CU", "America/Havana"],
  ["Cyprus", "Cyprus", "cyprus", "CY", "Asia/Nicosia"],
  ["Czech Republic", "Czech Republic", "czech-republic", "CZ", "Europe/Prague"],
  ["Denmark", "Denmark", "denmark", "DK", "Europe/Copenhagen"],
  ["Djibouti", "Djibouti", "djibouti", "DJ", "Africa/Djibouti"],
  ["Dominica", "Dominica", "dominica", "DM", "America/Dominica"],
  ["Dominican Republic", "Dominican Republic", "dominican-republic", "DO", "America/Santo_Domingo"],
  ["Ecuador", "Ecuador", "ecuador", "EC", "America/Guayaquil"],
  ["Egypt", "Egypt", "egypt", "EG", "Africa/Cairo"],
  ["El Salvador", "El Salvador", "el-salvador", "SV", "America/El_Salvador"],
  ["Equatorial Guinea", "Equatorial Guinea", "equatorial-guinea", "GQ", "Africa/Malabo"],
  ["Eritrea", "Eritrea", "eritrea", "ER", "Africa/Asmara"],
  ["Estonia", "Estonia", "estonia", "EE", "Europe/Tallinn"],
  ["Swaziland", "Eswatini", "eswatini", "SZ", "Africa/Mbabane"],
  ["Ethiopia", "Ethiopia", "ethiopia", "ET", "Africa/Addis_Ababa"],
  ["Fiji Islands", "Fiji", "fiji", "FJ", "Pacific/Fiji"],
  ["Finland", "Finland", "finland", "FI", "Europe/Helsinki"],
  ["France", "France", "france", "FR", "Europe/Paris"],
  ["Gabon", "Gabon", "gabon", "GA", "Africa/Libreville"],
  ["Gambia The", "The Gambia", "the-gambia", "GM", "Africa/Banjul"],
  ["Georgia", "Georgia", "georgia", "GE", "Asia/Tbilisi"],
  ["Germany", "Germany", "germany", "DE", "Europe/Berlin"],
  ["Ghana", "Ghana", "ghana", "GH", "Africa/Accra"],
  ["Greece", "Greece", "greece", "GR", "Europe/Athens"],
  ["Grenada", "Grenada", "grenada", "GD", "America/Grenada"],
  ["Guatemala", "Guatemala", "guatemala", "GT", "America/Guatemala"],
  ["Guinea", "Guinea", "guinea", "GN", "Africa/Conakry"],
  ["Guinea-Bissau", "Guinea-Bissau", "guinea-bissau", "GW", "Africa/Bissau"],
  ["Guyana", "Guyana", "guyana", "GY", "America/Guyana"],
  ["Haiti", "Haiti", "haiti", "HT", "America/Port-au-Prince"],
  ["Honduras", "Honduras", "honduras", "HN", "America/Tegucigalpa"],
  ["Hungary", "Hungary", "hungary", "HU", "Europe/Budapest"],
  ["Iceland", "Iceland", "iceland", "IS", "Atlantic/Reykjavik"],
  ["India", "India", "india", "IN", "Asia/Kolkata"],
  ["Indonesia", "Indonesia", "indonesia", "ID", "Asia/Jakarta"],
  ["Iran", "Iran", "iran", "IR", "Asia/Tehran"],
  ["Iraq", "Iraq", "iraq", "IQ", "Asia/Baghdad"],
  ["Ireland", "Ireland", "ireland", "IE", "Europe/Dublin"],
  ["Israel", "Israel", "israel", "IL", "Asia/Jerusalem"],
  ["Italy", "Italy", "italy", "IT", "Europe/Rome"],
  ["Ivory Coast", "Ivory Coast", "ivory-coast", "CI", "Africa/Abidjan"],
  ["Jamaica", "Jamaica", "jamaica", "JM", "America/Jamaica"],
  ["Japan", "Japan", "japan", "JP", "Asia/Tokyo"],
  ["Jordan", "Jordan", "jordan", "JO", "Asia/Amman"],
  ["Kazakhstan", "Kazakhstan", "kazakhstan", "KZ", "Asia/Almaty"],
  ["Kenya", "Kenya", "kenya", "KE", "Africa/Nairobi"],
  ["Kiribati", "Kiribati", "kiribati", "KI", "Pacific/Tarawa"],
  ["Kosovo", "Kosovo", "kosovo", "XK", "Europe/Belgrade"],
  ["Kuwait", "Kuwait", "kuwait", "KW", "Asia/Kuwait"],
  ["Kyrgyzstan", "Kyrgyzstan", "kyrgyzstan", "KG", "Asia/Bishkek"],
  ["Laos", "Laos", "laos", "LA", "Asia/Vientiane"],
  ["Latvia", "Latvia", "latvia", "LV", "Europe/Riga"],
  ["Lebanon", "Lebanon", "lebanon", "LB", "Asia/Beirut"],
  ["Lesotho", "Lesotho", "lesotho", "LS", "Africa/Maseru"],
  ["Liberia", "Liberia", "liberia", "LR", "Africa/Monrovia"],
  ["Libya", "Libya", "libya", "LY", "Africa/Tripoli"],
  ["Liechtenstein", "Liechtenstein", "liechtenstein", "LI", "Europe/Vaduz"],
  ["Lithuania", "Lithuania", "lithuania", "LT", "Europe/Vilnius"],
  ["Luxembourg", "Luxembourg", "luxembourg", "LU", "Europe/Luxembourg"],
  ["Madagascar", "Madagascar", "madagascar", "MG", "Indian/Antananarivo"],
  ["Malawi", "Malawi", "malawi", "MW", "Africa/Blantyre"],
  ["Malaysia", "Malaysia", "malaysia", "MY", "Asia/Kuala_Lumpur"],
  ["Maldives", "Maldives", "maldives", "MV", "Indian/Maldives"],
  ["Mali", "Mali", "mali", "ML", "Africa/Bamako"],
  ["Malta", "Malta", "malta", "MT", "Europe/Malta"],
  ["Marshall Islands", "Marshall Islands", "marshall-islands", "MH", "Pacific/Majuro"],
  ["Mauritania", "Mauritania", "mauritania", "MR", "Africa/Nouakchott"],
  ["Mauritius", "Mauritius", "mauritius", "MU", "Indian/Mauritius"],
  ["Mexico", "Mexico", "mexico", "MX", "America/Mexico_City"],
  ["Micronesia", "Micronesia", "micronesia", "FM", "Pacific/Pohnpei"],
  ["Moldova", "Moldova", "moldova", "MD", "Europe/Chisinau"],
  ["Mongolia", "Mongolia", "mongolia", "MN", "Asia/Ulaanbaatar"],
  ["Montenegro", "Montenegro", "montenegro", "ME", "Europe/Podgorica"],
  ["Morocco", "Morocco", "morocco", "MA", "Africa/Casablanca"],
  ["Mozambique", "Mozambique", "mozambique", "MZ", "Africa/Maputo"],
  ["Myanmar", "Myanmar", "myanmar", "MM", "Asia/Yangon"],
  ["Namibia", "Namibia", "namibia", "NA", "Africa/Windhoek"],
  ["Nauru", "Nauru", "nauru", "NR", "Pacific/Nauru"],
  ["Nepal", "Nepal", "nepal", "NP", "Asia/Kathmandu"],
  ["Netherlands", "Netherlands", "netherlands", "NL", "Europe/Amsterdam"],
  ["Netherlands Antilles", "Curaçao (Netherlands Antilles)", "curacao", "CW", "America/Curacao"],
  ["New Zealand", "New Zealand", "new-zealand", "NZ", "Pacific/Auckland"],
  ["Nicaragua", "Nicaragua", "nicaragua", "NI", "America/Managua"],
  ["Niger", "Niger", "niger", "NE", "Africa/Niamey"],
  ["Nigeria", "Nigeria", "nigeria", "NG", "Africa/Lagos"],
  ["North Korea", "North Korea", "north-korea", "KP", "Asia/Pyongyang"],
  ["Macedonia", "North Macedonia", "north-macedonia", "MK", "Europe/Skopje"],
  ["Norway", "Norway", "norway", "NO", "Europe/Oslo"],
  ["Oman", "Oman", "oman", "OM", "Asia/Muscat"],
  ["Pakistan", "Pakistan", "pakistan", "PK", "Asia/Karachi"],
  ["Palau", "Palau", "palau", "PW", "Pacific/Palau"],
  ["Palestine", "Palestine", "palestine", "PS", "Asia/Gaza"],
  ["Panama", "Panama", "panama", "PA", "America/Panama"],
  ["Papua new Guinea", "Papua New Guinea", "papua-new-guinea", "PG", "Pacific/Port_Moresby"],
  ["Paraguay", "Paraguay", "paraguay", "PY", "America/Asuncion"],
  ["Peru", "Peru", "peru", "PE", "America/Lima"],
  ["Philippines", "Philippines", "philippines", "PH", "Asia/Manila"],
  ["Poland", "Poland", "poland", "PL", "Europe/Warsaw"],
  ["Portugal", "Portugal", "portugal", "PT", "Europe/Lisbon"],
  ["Puerto Rico", "Puerto Rico", "puerto-rico", "PR", "America/Puerto_Rico"],
  ["Qatar", "Qatar", "qatar", "QA", "Asia/Qatar"],
  ["Congo", "Republic of the Congo", "republic-of-the-congo", "CG", "Africa/Brazzaville"],
  ["Romania", "Romania", "romania", "RO", "Europe/Bucharest"],
  ["Russia", "Russia", "russia", "RU", "Europe/Moscow"],
  ["Rwanda", "Rwanda", "rwanda", "RW", "Africa/Kigali"],
  ["Saint Kitts And Nevis", "Saint Kitts and Nevis", "saint-kitts-and-nevis", "KN", "America/St_Kitts"],
  ["Saint Lucia", "Saint Lucia", "saint-lucia", "LC", "America/St_Lucia"],
  ["Saint Vincent And The Grenadines", "Saint Vincent and the Grenadines", "saint-vincent-and-the-grenadines", "VC", "America/St_Vincent"],
  ["Samoa", "Samoa", "samoa", "WS", "Pacific/Apia"],
  ["San Marino", "San Marino", "san-marino", "SM", "Europe/San_Marino"],
  ["Sao Tome and Principe", "Sao Tome and Principe", "sao-tome-and-principe", "ST", "Africa/Sao_Tome"],
  ["Saudi Arabia", "Saudi Arabia", "saudi-arabia", "SA", "Asia/Riyadh"],
  ["Senegal", "Senegal", "senegal", "SN", "Africa/Dakar"],
  ["Serbia", "Serbia", "serbia", "RS", "Europe/Belgrade"],
  ["Seychelles", "Seychelles", "seychelles", "SC", "Indian/Mahe"],
  ["Sierra Leone", "Sierra Leone", "sierra-leone", "SL", "Africa/Freetown"],
  ["Singapore", "Singapore", "singapore", "SG", "Asia/Singapore"],
  ["Slovakia", "Slovakia", "slovakia", "SK", "Europe/Bratislava"],
  ["Slovenia", "Slovenia", "slovenia", "SI", "Europe/Ljubljana"],
  ["Solomon Islands", "Solomon Islands", "solomon-islands", "SB", "Pacific/Guadalcanal"],
  ["Somalia", "Somalia", "somalia", "SO", "Africa/Mogadishu"],
  ["South Africa", "South Africa", "south-africa", "ZA", "Africa/Johannesburg"],
  ["South Korea", "South Korea", "south-korea", "KR", "Asia/Seoul"],
  ["South Sudan", "South Sudan", "south-sudan", "SS", "Africa/Juba"],
  ["Spain", "Spain", "spain", "ES", "Europe/Madrid"],
  ["Sri Lanka", "Sri Lanka", "sri-lanka", "LK", "Asia/Colombo"],
  ["Sudan", "Sudan", "sudan", "SD", "Africa/Khartoum"],
  ["Suriname", "Suriname", "suriname", "SR", "America/Paramaribo"],
  ["Sweden", "Sweden", "sweden", "SE", "Europe/Stockholm"],
  ["Switzerland", "Switzerland", "switzerland", "CH", "Europe/Zurich"],
  ["Syria", "Syria", "syria", "SY", "Asia/Damascus"],
  ["Taiwan", "Taiwan", "taiwan", "TW", "Asia/Taipei"],
  ["Tajikistan", "Tajikistan", "tajikistan", "TJ", "Asia/Dushanbe"],
  ["Tanzania", "Tanzania", "tanzania", "TZ", "Africa/Dar_es_Salaam"],
  ["Thailand", "Thailand", "thailand", "TH", "Asia/Bangkok"],
  ["Timor-Leste", "Timor-Leste", "timor-leste", "TL", "Asia/Dili"],
  ["Togo", "Togo", "togo", "TG", "Africa/Lome"],
  ["Tonga", "Tonga", "tonga", "TO", "Pacific/Tongatapu"],
  ["Trinidad And Tobago", "Trinidad and Tobago", "trinidad-and-tobago", "TT", "America/Port_of_Spain"],
  ["Tunisia", "Tunisia", "tunisia", "TN", "Africa/Tunis"],
  ["Turkey", "Turkey", "turkey", "TR", "Europe/Istanbul"],
  ["Turkmenistan", "Turkmenistan", "turkmenistan", "TM", "Asia/Ashgabat"],
  ["Tuvalu", "Tuvalu", "tuvalu", "TV", "Pacific/Funafuti"],
  ["Uganda", "Uganda", "uganda", "UG", "Africa/Kampala"],
  ["Ukraine", "Ukraine", "ukraine", "UA", "Europe/Kyiv"],
  ["United Arab Emirates", "United Arab Emirates", "united-arab-emirates", "AE", "Asia/Dubai"],
  ["United Kingdom", "United Kingdom", "united-kingdom", "GB", "Europe/London"],
  ["United States", "United States", "united-states", "US", "America/New_York"],
  ["Uruguay", "Uruguay", "uruguay", "UY", "America/Montevideo"],
  ["Uzbekistan", "Uzbekistan", "uzbekistan", "UZ", "Asia/Tashkent"],
  ["Vanuatu", "Vanuatu", "vanuatu", "VU", "Pacific/Efate"],
  ["Venezuela", "Venezuela", "venezuela", "VE", "America/Caracas"],
  ["Vietnam", "Vietnam", "vietnam", "VN", "Asia/Ho_Chi_Minh"],
  ["Yemen", "Yemen", "yemen", "YE", "Asia/Aden"],
  ["Zambia", "Zambia", "zambia", "ZM", "Africa/Lusaka"],
  ["Zimbabwe", "Zimbabwe", "zimbabwe", "ZW", "Africa/Harare"],
];

export const COUNTRY_PAGES: CountryPage[] = ROWS.map(([name, display, slug, code, tz]) => ({ name, display, slug, code, tz }));

export const countryPageBySlug = (slug: string): CountryPage | undefined =>
  COUNTRY_PAGES.find((c) => c.slug === slug.toLowerCase());

export const countryPageByName = (name: string): CountryPage | undefined =>
  COUNTRY_PAGES.find((c) => c.name.toLowerCase() === name.trim().toLowerCase() || c.display.toLowerCase() === name.trim().toLowerCase());

export const countryPagePath = (c: CountryPage): string => `/country-battle/${c.slug}`;

export function flagEmoji(code: string): string {
  if (!/^[A-Z]{2}$/.test(code)) return "";
  return String.fromCodePoint(0x1f1e6 + code.charCodeAt(0) - 65, 0x1f1e6 + code.charCodeAt(1) - 65);
}

/** "Philippine Standard Time" and "GMT+8" for the country's battle clock (empty if unknown). */
export function zoneNames(tz: string, at = new Date()): { long: string; offset: string } {
  const part = (style: "long" | "shortOffset") => {
    try {
      return new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: style }).formatToParts(at)
        .find((p) => p.type === "timeZoneName")?.value ?? "";
    } catch { return ""; }
  };
  return { long: part("long"), offset: part("shortOffset") };
}

/** Countries whose page links first ("popular" — the launch markets), then alphabetical neighbours. */
export const LAUNCH_SLUGS = ["philippines", "united-states", "indonesia", "united-kingdom", "canada", "india", "australia", "mexico"];

export function relatedCountries(c: CountryPage, n = 12): CountryPage[] {
  const i = COUNTRY_PAGES.indexOf(c);
  const near = [-3, -2, -1, 1, 2, 3].map((k) => COUNTRY_PAGES[(i + k + COUNTRY_PAGES.length) % COUNTRY_PAGES.length]);
  const launch = LAUNCH_SLUGS.map((s) => countryPageBySlug(s)!).filter(Boolean);
  const out: CountryPage[] = [];
  for (const x of [...launch, ...near]) if (x !== c && !out.includes(x)) out.push(x);
  return out.slice(0, n);
}

// ---- the words ------------------------------------------------------------------------------

const WITH_THE = new Set(["philippines", "united-states", "united-kingdom", "united-arab-emirates", "netherlands", "czech-republic",
  "dominican-republic", "central-african-republic", "republic-of-the-congo", "maldives", "marshall-islands", "solomon-islands",
  "seychelles", "comoros"]);

/** The country inside a sentence: "the Philippines", "Nepal", "The Bahamas" → "the Bahamas". */
export function inSentence(c: CountryPage): string {
  if (/^The /.test(c.display)) return "the " + c.display.slice(4);
  return WITH_THE.has(c.slug) ? `the ${c.display}` : c.display;
}

export function countryPageTitle(c: CountryPage): string {
  return `${c.display} Country Battle – Every Hour, 10 Minutes | Bingg Bongg`;
}

export function countryPageDescription(c: CountryPage): string {
  return `Join the ${c.display} Country Battle on Bingg Bongg: a 10-minute live battle for the whole country every hour, on the hour, local time in ${inSentence(c)}. Go live, battle, watch and send gifts. Free on Android, iPhone and the web.`;
}

export interface CountryPageText {
  h1: string;
  intro: string;
  when: string[];
  how: string[];
  who: string;
  /** A paragraph in the country's own language, where we have one. */
  local?: { lang: string; title: string; text: string };
}

export function countryPageText(c: CountryPage, zone = zoneNames(c.tz)): CountryPageText {
  const clock = zone.long ? `${zone.long}${zone.offset ? ` (${zone.offset})` : ""}` : c.tz;
  const the = inSentence(c);
  const text: CountryPageText = {
    h1: `${c.display} Country Battle — every hour, 10 minutes`,
    intro: `Every hour, the whole of ${the} goes live together on Bingg Bongg. The ${c.display} Country Battle is a 10-minute live battle where everyone from ${the} can go live on one big screen at the same time, and the whole world can watch, cheer and send gifts.`,
    when: [
      `Every hour, on the hour — 24 battles a day, 7 days a week.`,
      `On local time in ${the}: ${clock}.`,
      `Each battle lasts 10 minutes. Joining opens 5 minutes before it starts.`,
      `Members get a push reminder before the battle starts, so nobody misses it.`,
    ],
    how: [
      `Download Bingg Bongg free from Google Play or the App Store, or open binggbongg.com on any computer.`,
      `Sign up with your email and a password — that is all it takes.`,
      `When the ${c.display} Country Battle opens, tap Join and go live with your country.`,
      `Not from ${the}? Tap Watch to see it live and send gifts to the people you like.`,
    ],
    who: `Members from ${the} battle in the ${c.display} Country Battle; anyone in any country can watch and send gifts. There is also Country VS Country, where ${the} goes up against another country live.`,
  };
  if (c.slug === "philippines") {
    text.local = {
      lang: "tl",
      title: "Philippines Country Battle — bawat oras, 10 minuto",
      text: "Bawat oras, sabay-sabay na nagla-live ang buong Pilipinas sa Bingg Bongg. Ang Philippines Country Battle ay 10 minutong live battle, tuwing sakto ang oras, oras ng Pilipinas. Mag-download nang libre sa Google Play o App Store, mag-sign up gamit ang email at password, at pindutin ang Join kapag bukas na ang battle. Puwedeng manood at magpadala ng gifts ang kahit sino, saan mang bansa.",
    };
  } else if (c.slug === "indonesia") {
    text.local = {
      lang: "id",
      title: "Country Battle Indonesia — setiap jam, 10 menit",
      text: "Setiap jam, seluruh Indonesia live bersama di Bingg Bongg. Country Battle Indonesia adalah battle live selama 10 menit, tepat di awal setiap jam, waktu Indonesia. Unduh gratis di Google Play atau App Store, daftar dengan email dan kata sandi, lalu tekan Join saat battle dibuka. Siapa pun dari negara mana pun bisa menonton dan mengirim gift.",
    };
  }
  return text;
}
