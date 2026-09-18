import { useState, useEffect, useRef } from "react";
import { supabase } from "./supabase";

const zikirList = [
  { id: "subhanallah", arabic: "سُبْحَانَ ٱللَّٰهِ", meaningEn: "Glory be to Allah", meaningMs: "Maha Suci Allah", target: 33 },
  { id: "alhamdulillah", arabic: "ٱلْحَمْدُ لِلَّٰهِ", meaningEn: "Praise be to Allah", meaningMs: "Segala puji bagi Allah", target: 33 },
  { id: "allahuakbar", arabic: "ٱللَّٰهُ أَكْبَرُ", meaningEn: "Allah is the Greatest", meaningMs: "Allah Maha Besar", target: 34 },
  { id: "selawat", arabic: "اللَّهُمَّ صَلِّ عَلَىٰ مُحَمَّدٍ وَعَلَىٰ آلِ مُحَمَّدٍ", meaningEn: "O Allah, send blessings upon Muhammad and the family of Muhammad", meaningMs: "Ya Allah, selawat ke atas Nabi Muhammad dan keluarga baginda", target: 100 },
  { id: "astaghfirullah", arabic: "أَسْتَغْفِرُ اللَّهَ", meaningEn: "I seek forgiveness from Allah", meaningMs: "Aku memohon ampun kepada Allah", target: 100 },
  { id: "lailahaillallah", arabic: "لَا إِلَٰهَ إِلَّا ٱللَّٰهُ", meaningEn: "There is no deity but Allah", meaningMs: "Tiada Tuhan melainkan Allah", target: 100 }
];

// Helper to get local date string YYYY-MM-DD
function getLocalDateString() {
  const date = new Date();
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().split('T')[0];
}

export default function ZikirTracker({ session, lang }) {
  const [activeZikir, setActiveZikir] = useState(zikirList[0]);
  const [counts, setCounts] = useState({});
  const [streak, setStreak] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  
  const saveTimeoutRef = useRef(null);

  // Load today's data and calculate streak on mount
  useEffect(() => {
    if (!session) return;
    loadData();
  }, [session]);

  const loadData = async () => {
    try {
      const today = getLocalDateString();
      
      // Fetch all records for streak calculation
      const { data, error } = await supabase
        .from('zikir_records')
        .select('*')
        .eq('user_id', session.user.id)
        .order('date', { ascending: false });
        
      if (error) {
        // Table might not exist yet, suppress error silently
        console.log("Supabase Zikir table might not exist yet.", error.message);
        return;
      }

      // Find today's record
      const todayRecord = data.find(r => r.date === today);
      if (todayRecord) {
        setCounts({
          subhanallah: todayRecord.subhanallah || 0,
          alhamdulillah: todayRecord.alhamdulillah || 0,
          allahuakbar: todayRecord.allahuakbar || 0,
          selawat: todayRecord.selawat || 0,
          astaghfirullah: todayRecord.astaghfirullah || 0,
          lailahaillallah: todayRecord.lailahaillallah || 0,
        });
      }

      // Calculate Streak
      let currentStreak = 0;
      let checkDate = new Date();
      
      // Reset time to midnight for accurate day difference
      checkDate.setHours(0,0,0,0);
      
      for (let i = 0; i < 365; i++) {
        // Format checkDate to YYYY-MM-DD
        const offset = checkDate.getTimezoneOffset() * 60000;
        const dateStr = new Date(checkDate.getTime() - offset).toISOString().split('T')[0];
        
        const dayRecord = data.find(r => r.date === dateStr);
        
        // A day counts towards streak if they did ANY zikir that day
        const didZikir = dayRecord && (
          dayRecord.subhanallah > 0 || dayRecord.alhamdulillah > 0 || 
          dayRecord.allahuakbar > 0 || dayRecord.selawat > 0 || 
          dayRecord.astaghfirullah > 0 || dayRecord.lailahaillallah > 0
        );

        if (didZikir) {
          currentStreak++;
        } else if (i === 0) {
          // If they missed today, it's fine, their streak from yesterday might still be alive
          // So we don't break on i=0, we just don't increment.
        } else {
          // If they missed yesterday or any prior day, the streak is broken
          break;
        }
        
        // Go back 1 day
        checkDate.setDate(checkDate.getDate() - 1);
      }
      
      setStreak(currentStreak);

    } catch (err) {
      console.error(err);
    }
  };

  const triggerSave = (newCounts) => {
    if (!session) return;
    setIsSaving(true);
    
    // Clear existing timeout
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    
    // Debounce save by 2 seconds
    saveTimeoutRef.current = setTimeout(async () => {
      const today = getLocalDateString();
      
      try {
        const { error } = await supabase
          .from('zikir_records')
          .upsert({
            user_id: session.user.id,
            date: today,
            ...newCounts
          });
          
        if (error) console.error("Error saving zikir", error);
      } catch (err) {
        console.error(err);
      } finally {
        setIsSaving(false);
      }
    }, 2000);
  };

  const addCount = (amount) => {
    const newCounts = {
      ...counts,
      [activeZikir.id]: (counts[activeZikir.id] || 0) + amount
    };
    setCounts(newCounts);
    triggerSave(newCounts);
  };

  const handleTap = () => {
    addCount(1);
    
    // Vibrate device if supported
    if (navigator.vibrate) {
      const current = (counts[activeZikir.id] || 0) + 1;
      if (current % activeZikir.target === 0) {
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
        addCount(num);
      }
    }
  };

  const handleReset = () => {
    if (window.confirm(lang === "en" ? "Reset counter to zero?" : "Set semula kaunter ke sifar?")) {
      const newCounts = { ...counts, [activeZikir.id]: 0 };
      setCounts(newCounts);
      triggerSave(newCounts);
    }
  };

  const currentCount = counts[activeZikir.id] || 0;
  const totalSessionCount = Object.values(counts).reduce((a, b) => a + (b || 0), 0);

  return (
    <div className="space-y-6 pb-20 max-w-md mx-auto">
      
      {/* Dashboard Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-stone-50 border border-stone-200 rounded-2xl p-4 flex flex-col justify-center items-center shadow-sm">
          <span className="text-stone-500 font-bold text-sm mb-1">{lang === "en" ? "Total Today" : "Jumlah Hari Ini"}</span>
          <span className="text-3xl font-bold text-emerald-700">{totalSessionCount}</span>
        </div>
        <div className="bg-stone-50 border border-stone-200 rounded-2xl p-4 flex flex-col justify-center items-center shadow-sm relative">
          {isSaving && <span className="absolute top-2 right-2 flex h-2 w-2 rounded-full bg-emerald-500 animate-ping"></span>}
          <span className="text-stone-500 font-bold text-sm mb-1">{lang === "en" ? "Daily Streak" : "Strik Harian"}</span>
          <span className="text-3xl font-bold text-amber-500 flex items-center gap-1">🔥 {streak}</span>
        </div>
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
              strokeDashoffset={2 * Math.PI * 120 * (1 - Math.min((currentCount % activeZikir.target) / activeZikir.target, 1))}
              className="text-emerald-500 transition-all duration-300"
            />
          </svg>
        </div>

        <button 
          onClick={handleTap}
          className="w-56 h-56 rounded-full bg-emerald-50 hover:bg-emerald-100 border-8 border-white shadow-xl flex flex-col items-center justify-center transition-transform active:scale-95 z-10"
        >
          <span className="text-6xl font-black text-emerald-700">{currentCount}</span>
          <span className="text-sm font-bold text-emerald-500 mt-2">
            / {Math.floor(currentCount / activeZikir.target) * activeZikir.target + activeZikir.target}
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
          {zikirList.map(z => {
            const zCount = counts[z.id] || 0;
            return (
              <button
                key={z.id}
                onClick={() => setActiveZikir(z)}
                className={`relative overflow-hidden p-4 rounded-2xl border-2 text-center transition-all ${activeZikir.id === z.id ? 'border-emerald-500 bg-emerald-50' : 'border-stone-100 bg-white hover:border-emerald-200'}`}
              >
                {/* Tiny progress bar at bottom of card */}
                {zCount > 0 && (
                  <div className="absolute bottom-0 left-0 h-1 bg-emerald-500" style={{ width: `${Math.min((zCount % z.target) / z.target * 100, 100)}%` }} />
                )}
                <div className="absolute top-2 left-2 text-xs font-bold text-emerald-600 bg-emerald-100 px-2 rounded-full">
                  {zCount > 0 && zCount}
                </div>
                <p className="text-2xl font-bold text-stone-800 mb-2 mt-2" dir="rtl">{z.arabic}</p>
                <p className="text-xs text-stone-500">{lang === "en" ? z.meaningEn : z.meaningMs}</p>
              </button>
            );
          })}
        </div>
      </div>

    </div>
  );
}
