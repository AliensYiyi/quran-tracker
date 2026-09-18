import { useState, useEffect } from "react";
import { supabase } from "./supabase";

const zikirList = [
  { id: "subhanallah", arabic: "سُبْحَانَ ٱللَّٰهِ", meaningEn: "Glory be to Allah", meaningMs: "Maha Suci Allah", target: 33 },
  { id: "alhamdulillah", arabic: "ٱلْحَمْدُ لِلَّٰهِ", meaningEn: "Praise be to Allah", meaningMs: "Segala puji bagi Allah", target: 33 },
  { id: "allahuakbar", arabic: "ٱللَّٰهُ أَكْبَرُ", meaningEn: "Allah is the Greatest", meaningMs: "Allah Maha Besar", target: 34 },
  { id: "selawat", arabic: "اللَّهُمَّ صَلِّ عَلَىٰ مُحَمَّدٍ وَعَلَىٰ آلِ مُحَمَّدٍ", meaningEn: "O Allah, send blessings upon Muhammad and the family of Muhammad", meaningMs: "Ya Allah, selawat ke atas Nabi Muhammad dan keluarga baginda", target: 100 },
  { id: "astaghfirullah", arabic: "أَسْتَغْفِرُ اللَّهَ", meaningEn: "I seek forgiveness from Allah", meaningMs: "Aku memohon ampun kepada Allah", target: 100 },
  { id: "lailahaillallah", arabic: "لَا إِلَٰهَ إِلَّا ٱللَّٰهُ", meaningEn: "There is no deity but Allah", meaningMs: "Tiada Tuhan melainkan Allah", target: 100 }
];

export default function ZikirTracker({ session, lang }) {
  const [activeZikir, setActiveZikir] = useState(zikirList[0]);
  const [count, setCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  const handleTap = () => {
    setCount(prev => prev + 1);
    setTotalCount(prev => prev + 1);
    
    // Vibrate device if supported
    if (navigator.vibrate) {
      if (count + 1 === activeZikir.target) {
        navigator.vibrate([100, 50, 100]); // longer vibration on target hit
      } else {
        navigator.vibrate(20);
      }
    }
  };

  const handleManualAdd = () => {
    const input = window.prompt(lang === "en" ? "Enter number to add manually:" : "Masukkan jumlah untuk ditambah secara manual:", "100");
    if (input) {
      const num = parseInt(input, 10);
      if (!isNaN(num) && num > 0) {
        setCount(prev => prev + num);
        setTotalCount(prev => prev + num);
      }
    }
  };

  const handleReset = () => {
    if (window.confirm(lang === "en" ? "Reset current counter?" : "Set semula kaunter ini?")) {
      setCount(0);
    }
  };

  const handleZikirSelect = (z) => {
    setActiveZikir(z);
    setCount(0);
  };

  return (
    <div className="space-y-6 pb-20 max-w-md mx-auto">
      
      {/* Total Session Counter */}
      <div className="bg-stone-50 border border-stone-200 rounded-3xl p-4 flex justify-between items-center shadow-sm">
        <span className="text-stone-500 font-bold">{lang === "en" ? "Session Total" : "Jumlah Sesi"}</span>
        <span className="text-2xl font-bold text-emerald-700">{totalCount}</span>
      </div>

      {/* Active Zikir Display */}
      <div className="text-center bg-white rounded-3xl p-8 shadow-sm border border-emerald-100 flex flex-col items-center justify-center min-h-[250px]">
        <p className="text-5xl md:text-6xl font-bold text-emerald-800 leading-[1.8] mb-4" dir="rtl" style={{ fontFamily: "'Amiri', 'Traditional Arabic', serif" }}>
          {activeZikir.arabic}
        </p>
        <p className="text-stone-500 font-medium mt-4 px-4">
          {lang === "en" ? activeZikir.meaningEn : activeZikir.meaningMs}
        </p>
      </div>

      {/* The Big Tap Button */}
      <div className="flex flex-col items-center justify-center my-10 relative">
        {/* Progress Ring Background */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
           <svg className="w-64 h-64 transform -rotate-90">
            <circle
              cx="128"
              cy="128"
              r="120"
              stroke="currentColor"
              strokeWidth="8"
              fill="transparent"
              className="text-stone-100"
            />
            <circle
              cx="128"
              cy="128"
              r="120"
              stroke="currentColor"
              strokeWidth="8"
              fill="transparent"
              strokeDasharray={2 * Math.PI * 120}
              strokeDashoffset={2 * Math.PI * 120 * (1 - Math.min(count / activeZikir.target, 1))}
              className="text-emerald-500 transition-all duration-300"
            />
          </svg>
        </div>

        <button 
          onClick={handleTap}
          className="w-56 h-56 rounded-full bg-emerald-50 hover:bg-emerald-100 border-8 border-white shadow-xl flex flex-col items-center justify-center transition-transform active:scale-95 z-10"
        >
          <span className="text-6xl font-black text-emerald-700">{count}</span>
          <span className="text-sm font-bold text-emerald-500 mt-2">
            / {activeZikir.target}
          </span>
        </button>
      </div>

      <div className="flex justify-center gap-3">
        <button 
          onClick={handleManualAdd}
          className="px-6 py-2 rounded-full bg-emerald-100 text-emerald-700 font-bold hover:bg-emerald-200 text-sm flex items-center gap-2"
        >
          + {lang === "en" ? "Manual Add" : "Tambah Manual"}
        </button>
        <button 
          onClick={handleReset}
          className="px-6 py-2 rounded-full bg-stone-200 text-stone-600 font-bold hover:bg-stone-300 text-sm flex items-center gap-2"
        >
          ↺ {lang === "en" ? "Reset" : "Set Semula"}
        </button>
      </div>

      {/* Zikir Selector */}
      <div className="mt-8">
        <h3 className="font-bold text-stone-800 mb-4">{lang === "en" ? "Select Zikir" : "Pilih Zikir"}</h3>
        <div className="grid grid-cols-2 gap-3">
          {zikirList.map(z => (
            <button
              key={z.id}
              onClick={() => handleZikirSelect(z)}
              className={`p-4 rounded-2xl border-2 text-center transition-all ${activeZikir.id === z.id ? 'border-emerald-500 bg-emerald-50' : 'border-stone-100 bg-white hover:border-emerald-200'}`}
            >
              <p className="text-2xl font-bold text-stone-800 mb-2" dir="rtl">{z.arabic}</p>
              <p className="text-xs text-stone-500">{lang === "en" ? z.meaningEn : z.meaningMs}</p>
            </button>
          ))}
        </div>
      </div>

    </div>
  );
}

