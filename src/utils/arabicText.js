/**
 * Utility functions to fetch Quran Arabic text and translations
 * using the reliable Alquran.cloud API.
 */

const API_BASE = "https://api.alquran.cloud/v1";

/**
 * Fetch a specific Ayah in Arabic (Uthmani script) and its translation.
 * 
 * @param {number} surahNumber - The Surah number (1-114)
 * @param {number} ayahNumber - The Ayah number within the Surah
 * @param {string} lang - "en" for English, "ms" for Malay
 * @returns {Promise<{arabic: string, translation: string, audio: string}>}
 */
export const getAyahText = async (surahNumber, ayahNumber, lang = "en") => {
  try {
    const translationEdition = lang === "ms" ? "ms.basmeih" : "en.asad";
    
    // Fetch both Arabic text and translation concurrently
    const [arabicRes, transRes] = await Promise.all([
      fetch(`${API_BASE}/ayah/${surahNumber}:${ayahNumber}/quran-uthmani`),
      fetch(`${API_BASE}/ayah/${surahNumber}:${ayahNumber}/${translationEdition}`)
    ]);

    const arabicData = await arabicRes.json();
    const transData = await transRes.json();

    if (arabicData.code === 200 && transData.code === 200) {
      return {
        arabic: arabicData.data.text,
        translation: transData.data.text,
        surahName: arabicData.data.surah.name,
        surahEnglishName: arabicData.data.surah.englishName,
      };
    }
    throw new Error("Failed to load Ayah data");
  } catch (error) {
    console.error("Error fetching Ayah:", error);
    return null;
  }
};

/**
 * Fetch an entire Surah in Arabic.
 * 
 * @param {number} surahNumber - The Surah number (1-114)
 * @returns {Promise<Array<{ayah: number, text: string}>>}
 */
export const getSurahText = async (surahNumber) => {
  try {
    const res = await fetch(`${API_BASE}/surah/${surahNumber}/quran-uthmani`);
    const data = await res.json();
    
    if (data.code === 200) {
      return data.data.ayahs.map(a => ({
        ayah: a.numberInSurah,
        text: a.text
      }));
    }
    throw new Error("Failed to load Surah data");
  } catch (error) {
    console.error("Error fetching Surah:", error);
    return [];
  }
};
