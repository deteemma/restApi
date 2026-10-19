const numberFormats = new Map<string, Intl.NumberFormat>();

/**
 * Durée lisible, au format de la langue : « 375 ms », « 2,4 s », « 3 min 05 s ».
 * Les unités (ms, s, min) sont les mêmes dans les quatre langues de l'interface.
 */
export function formatDuration(ms: number, lang: string): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) {
    let format = numberFormats.get(lang);
    if (!format) {
      format = new Intl.NumberFormat(lang, { maximumFractionDigits: 1 });
      numberFormats.set(lang, format);
    }
    return `${format.format(ms / 1000)} s`;
  }
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes} min ${seconds} s`;
}
