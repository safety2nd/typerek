export const EKSTRAKLASA_TEAMS = [
  "Cracovia",
  "GKS Katowice",
  "Górnik Zabrze",
  "Jagiellonia Białystok",
  "Korona Kielce",
  "Lech Poznań",
  "Legia Warszawa",
  "Motor Lublin",
  "Piast Gliwice",
  "Pogoń Szczecin",
  "Radomiak Radom",
  "Raków Częstochowa",
  "Śląsk Wrocław",
  "Wieczysta Kraków",
  "Widzew Łódź",
  "Wisła Kraków",
  "Wisła Płock",
  "Zagłębie Lubin",
] as const;

export type EkstraklasaTeam = (typeof EKSTRAKLASA_TEAMS)[number];