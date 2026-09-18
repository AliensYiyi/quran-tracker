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
export const getSurahText = async (surahNumber, lang = "ms") => {
  try {
    const translationEdition = lang === "en" ? "en.asad" : "ms.basmeih";
    const res = await fetch(`${API_BASE}/surah/${surahNumber}/editions/quran-uthmani,${translationEdition}`);
    const data = await res.json();
    
    if (data.code === 200) {
      const quranData = data.data[0].ayahs;
      const transData = data.data[1].ayahs;
      const bismillah = "بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ ";
      
      return quranData.map((a, index) => {
        let text = a.text;
        // The API prepends Bismillah to Ayah 1 of every Surah except Al-Fatihah.
        // We strip it here so it doesn't show up inside the Ayah 1 flashcard.
        if (surahNumber !== 1 && a.numberInSurah === 1 && text.startsWith(bismillah)) {
          text = text.replace(bismillah, "");
        }
        
        return {
          ayah: a.numberInSurah,
          globalAyah: a.number,
          text: text,
          translation: transData[index].text
        };
      });
    }
    throw new Error("Failed to load Surah data");
  } catch (error) {
    console.error("Error fetching Surah:", error);
    return [];
  }
};
