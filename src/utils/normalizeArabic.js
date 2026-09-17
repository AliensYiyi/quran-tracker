export const normalizeArabic = (text) => {
  if (!text) return "";
  let normalized = text
    // Remove Zero-Width No-Break Space / BOM (often at the start of API strings)
    .replace(/\uFEFF/g, '')
    // Convert Dagger Alif to regular Alif so it matches standard speech recognition text
    .replace(/\u0670/g, 'ا')
    // Remove Arabic diacritics (tashkeel/harakat), excluding \u0670 which we just handled
    .replace(/[\u0610-\u061A\u064B-\u065F\u06D6-\u06DC\u06DF-\u06E8\u06EA-\u06ED]/g, '')
    // Normalize various forms of Alif (including Alif Waslah ٱ) to bare Alif
    .replace(/[أإآٱ]/g, 'ا')
    // Normalize Taa Marbutah to Haa (common in speech recognition)
    .replace(/ة/g, 'ه')
    // Normalize Alif Maqsurah to Yaa
    .replace(/ى/g, 'ي')
    // Remove punctuation
    .replace(/[.,،;؛?؟!]/g, '')
    // Collapse whitespace
    .replace(/\s+/g, ' ')
    .trim();

  // Handle common spelling discrepancies between Uthmani Dagger Alif and Modern Standard Arabic
  normalized = normalized.replace(/الرحمان/g, 'الرحمن');
  normalized = normalized.replace(/الاه/g, 'اله');
  normalized = normalized.replace(/ذالك/g, 'ذلك');
  normalized = normalized.replace(/هاذا/g, 'هذا');
  normalized = normalized.replace(/هاذه/g, 'هذه');
  normalized = normalized.replace(/لاكن/g, 'لكن');
  normalized = normalized.replace(/سموات/g, 'سماوات');
  
  return normalized;
};

