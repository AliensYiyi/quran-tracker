import { useState, useEffect } from "react";
import { surahs } from "../../data/surahs";
import { getSurahText } from "../../utils/arabicText";

function AyahCard({ ayah, lang, globalRevealState }) {
  const [isRevealed, setIsRevealed] = useState(true);

  // Sync with global "Hide All" / "Show All" button
  useEffect(() => {
    setIsRevealed(globalRevealState);
  }, [globalRevealState]);

  return (
    <div 
      onClick={() => setIsRevealed(!isRevealed)}
      className={`p-6 rounded-2xl shadow-sm border-2 cursor-pointer transition-all ${isRevealed ? 'bg-white border-emerald-100' : 'bg-stone-50 border-stone-200 hover:bg-stone-100'}`}
    >
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm font-bold text-stone-400">
          {lang === "en" ? "Ayah" : "Ayat"} {ayah.ayah}
        </span>
        <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md">
          {isRevealed ? (lang === "en" ? "Tap to hide" : "Tekan untuk sembunyi") : (lang === "en" ? "Tap to reveal" : "Tekan untuk papar")}
        </span>
      </div>

      <div className={`transition-all duration-300 ${isRevealed ? 'opacity-100 blur-none' : 'opacity-0 h-0 overflow-hidden blur-md'}`}>
        <p 
          dir="rtl" 
          className="text-3xl leading-loose text-stone-900 text-right mt-4"
          style={{ fontFamily: "'Amiri', 'Traditional Arabic', serif" }}
        >
          {ayah.text}
        </p>
      </div>

      {!isRevealed && (
        <div className="h-12 flex items-center justify-center">
          <p className="text-stone-400 font-medium">???</p>
        </div>
      )}
    </div>
  );
}

export default function HafazanHome({ session, lang }) {
  const [selectedSurah, setSelectedSurah] = useState(null);
  const [surahText, setSurahText] = useState([]);
  const [loading, setLoading] = useState(false);
  const [globalRevealState, setGlobalRevealState] = useState(true);

  const openSurah = async (surah) => {
    setSelectedSurah(surah);
    setGlobalRevealState(true); // default to show when opening
    setLoading(true);
    const textData = await getSurahText(surah.id);
    setSurahText(textData);
    setLoading(false);
  };

  if (selectedSurah) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <button 
            onClick={() => setSelectedSurah(null)} 
            className="flex items-center gap-2 text-sm font-bold text-stone-500 hover:text-emerald-700 bg-stone-200 px-4 py-2 rounded-full"
          >
            &larr; {lang === "en" ? "Back" : "Kembali"}
          </button>
          
          {!loading && surahText.length > 0 && (
            <button 
              onClick={() => setGlobalRevealState(!globalRevealState)}
              className="text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 px-4 py-2 rounded-full shadow-sm"
            >
              {globalRevealState 
                ? (lang === "en" ? "🙈 Hide All" : "🙈 Sembunyi Semua") 
                : (lang === "en" ? "👀 Show All" : "👀 Papar Semua")}
            </button>
          )}
        </div>

        <div className="text-center bg-emerald-800 text-white rounded-3xl p-6 shadow-sm">
          <h2 className="text-3xl font-bold mb-1">{selectedSurah.arabic}</h2>
          <p className="text-emerald-200 font-medium">{selectedSurah.name}</p>
          <p className="text-emerald-300 text-sm mt-2">{selectedSurah.ayahs} Ayahs</p>
        </div>

        {loading ? (
          <div className="text-center py-10 text-stone-500">
            {lang === "en" ? "Loading Quran text..." : "Memuatkan teks Al-Quran..."}
          </div>
        ) : (
          <div className="space-y-4">
            {selectedSurah.id !== 1 && (
              <div className="text-center py-4">
                <p 
                  dir="rtl" 
                  className="text-3xl leading-loose text-stone-800"
                  style={{ fontFamily: "'Amiri', 'Traditional Arabic', serif" }}
                >
                  بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ
                </p>
              </div>
            )}
            {surahText.map((ayah) => (
              <AyahCard key={ayah.ayah} ayah={ayah} lang={lang} globalRevealState={globalRevealState} />
            ))}
          </div>
        )}
      </div>
    );
  }

  // Ayat Lazim: Al-Fatihah (1) and Ad-Duha (93) to An-Nas (114)
  const ayatLazimIds = [1, ...Array.from({ length: 22 }, (_, i) => i + 93)];
  const lazimSurahs = surahs.filter((s) => ayatLazimIds.includes(s.id));

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-stone-900 mb-6">
        {lang === "en" ? "Ayat Lazim (Juz 30)" : "Ayat Lazim (Juz Amma)"}
      </h2>
      
      <div className="grid grid-cols-1 gap-3">
        {lazimSurahs.map((surah) => (
          <button
            key={surah.id}
            onClick={() => openSurah(surah)}
            className="flex items-center justify-between p-4 bg-white rounded-2xl shadow-sm hover:shadow-md hover:-translate-y-0.5 border border-stone-100 text-left transition-all"
          >
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold">
                {surah.id}
              </div>
              <div>
                <span className="font-bold text-stone-800 text-lg block">{surah.name}</span>
                <span className="text-sm text-stone-500">{surah.ayahs} {lang === "en" ? "Ayahs" : "Ayat"}</span>
              </div>
            </div>
            <span 
              className="text-2xl text-emerald-800"
              style={{ fontFamily: "'Amiri', 'Traditional Arabic', serif" }}
            >
              {surah.arabic}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
