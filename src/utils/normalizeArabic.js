export const normalizeArabic = (text) => {
  if (!text) return "";
  return text
    // Remove Arabic diacritics (tashkeel/harakat)
    .replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E8\u06EA-\u06ED]/g, '')
    // Normalize various forms of Alif to bare Alif
    .replace(/[أإآ]/g, 'ا')
    // Normalize Taa Marbutah to Haa (common in speech recognition)
    .replace(/ة/g, 'ه')
    // Normalize Alif Maqsurah to Yaa
    .replace(/ى/g, 'ي')
    // Remove punctuation
    .replace(/[.,،;؛?؟!]/g, '')
    // Collapse whitespace
    .replace(/\s+/g, ' ')
    .trim();
};
