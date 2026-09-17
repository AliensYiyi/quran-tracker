import { useState, useEffect, useMemo } from "react";
import { supabase } from "./supabase";

export default function SolatTracker({ session, lang }) {
  const [solatRecords, setSolatRecords] = useState([]);
  const [waktuSolat, setWaktuSolat] = useState(null);
  const [loading, setLoading] = useState(true);

  // Today's local date string (e.g. "2026-09-17")
  const todayDateStr = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD format

  useEffect(() => {
    fetchWaktuSolat();
    if (session) {
      fetchSolatRecords();
    }
  }, [session]);

  const fetchWaktuSolat = async () => {
    try {
      // Using Aladhan API for Kuala Lumpur. In future, we can add geolocation.
      const res = await fetch("https://api.aladhan.com/v1/timingsByCity?city=Kuala+Lumpur&country=Malaysia&method=11");
      const data = await res.json();
      if (data && data.data && data.data.timings) {
        setWaktuSolat({
          Subuh: data.data.timings.Fajr,
          Syuruk: data.data.timings.Sunrise,
          Zohor: data.data.timings.Dhuhr,
          Asar: data.data.timings.Asr,
          Maghrib: data.data.timings.Maghrib,
          Isyak: data.data.timings.Isha,
        });
      }
    } catch (err) {
      console.error("Failed to fetch Waktu Solat:", err);
    }
  };

  const fetchSolatRecords = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("solat_records")
      .select("*")
      .order("date", { ascending: true });

    if (!error && data) {
      setSolatRecords(data);
    }
    setLoading(false);
  };

  // Get or initialize today's record
  const todayRecord = useMemo(() => {
    const record = solatRecords.find((r) => r.date === todayDateStr);
    return (
      record || {
        date: todayDateStr,
        subuh: false,
        zohor: false,
        asar: false,
        maghrib: false,
        isyak: false,
        qada_count: 0,
      }
    );
  }, [solatRecords, todayDateStr]);

  // Calculate Streak
  const streak = useMemo(() => {
    if (solatRecords.length === 0) return 0;
    
    // Sort descending by date
    const sorted = [...solatRecords].sort((a, b) => new Date(b.date) - new Date(a.date));
    let currentStreak = 0;
    
    // Start from today or yesterday
    let dateToCheck = new Date(todayDateStr);
    
    for (let i = 0; i < sorted.length; i++) {
      const record = sorted[i];
      const recordDate = new Date(record.date);
      
      const isComplete = record.subuh && record.zohor && record.asar && record.maghrib && record.isyak;
      
      // If it's today and not complete, we skip checking today and check yesterday instead
      if (record.date === todayDateStr && !isComplete) {
        continue;
      }
      
      // If record date matches our check date and is complete
      if (record.date === dateToCheck.toLocaleDateString("en-CA") && isComplete) {
        currentStreak++;
        dateToCheck.setDate(dateToCheck.getDate() - 1);
      } else {
        // Streak broken
        break;
      }
    }
    return currentStreak;
  }, [solatRecords, todayDateStr]);

  const updateSolat = async (field, value) => {
    if (!session) return;
    
    const newRecord = { ...todayRecord, [field]: value };
    const { id, ...payload } = newRecord;
    
    // Optimistic UI update
    setSolatRecords(prev => {
      const exists = prev.find(r => r.date === todayDateStr);
      if (exists) return prev.map(r => r.date === todayDateStr ? { ...r, [field]: value } : r);
      return [...prev, newRecord];
    });

    const isExisting = solatRecords.find((r) => r.date === todayDateStr);
    
    if (isExisting) {
      await supabase
        .from("solat_records")
        .update({ [field]: value })
        .eq("id", isExisting.id);
    } else {
      const { data, error } = await supabase
        .from("solat_records")
        .insert({
          user_id: session.user.id,
          date: todayDateStr,
          subuh: newRecord.subuh,
          zohor: newRecord.zohor,
          asar: newRecord.asar,
          maghrib: newRecord.maghrib,
          isyak: newRecord.isyak,
          qada_count: newRecord.qada_count,
        })
        .select()
        .single();
        
      if (data) {
        setSolatRecords(prev => prev.map(r => r.date === todayDateStr ? data : r));
      }
    }
  };

  const prayers = [
    { id: "subuh", label: "Subuh" },
    { id: "zohor", label: "Zohor" },
    { id: "asar", label: "Asar" },
    { id: "maghrib", label: "Maghrib" },
    { id: "isyak", label: "Isyak" },
  ];

  if (loading) {
    return <div className="text-center text-stone-500 py-10">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      
      {/* Streak */}
      {streak > 0 && (
        <div className="rounded-3xl bg-amber-100 p-6 flex flex-col items-center shadow-sm">
          <div className="text-4xl mb-2 emoji">🔥</div>
          <h2 className="text-2xl font-bold text-amber-900">{streak} {lang === "en" ? "Day Streak" : "Hari Berturut"}</h2>
          <p className="text-amber-800 text-sm">{lang === "en" ? "Perfect 5 prayers!" : "Sempurna 5 waktu!"}</p>
        </div>
      )}

      {/* Waktu Solat Widget */}
      <div className="rounded-3xl bg-emerald-800 p-6 text-white shadow-sm">
        <h2 className="text-lg font-bold mb-4">{lang === "en" ? "Waktu Solat (Kuala Lumpur)" : "Waktu Solat (Kuala Lumpur)"}</h2>
        {waktuSolat ? (
          <div className="grid grid-cols-3 gap-4 text-center">
            {Object.entries(waktuSolat).map(([name, time]) => (
              <div key={name} className="bg-emerald-900/50 rounded-xl p-3">
                <p className="text-emerald-200 text-xs font-medium uppercase tracking-wider">{name}</p>
                <p className="font-bold text-lg mt-1">{time}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-emerald-200 text-sm">Loading prayer times...</p>
        )}
      </div>

      {/* Daily Checklist */}
      <div className="rounded-3xl bg-white p-6 shadow-sm">
        <h2 className="text-xl font-bold text-stone-900 mb-4">{lang === "en" ? "Today's Fardhu" : "Fardu Hari Ini"}</h2>
        <div className="space-y-3">
          {prayers.map((prayer) => (
            <label key={prayer.id} className="flex items-center justify-between p-4 rounded-2xl bg-stone-50 border border-stone-100 cursor-pointer hover:bg-stone-100 transition-colors">
              <span className="font-semibold text-stone-800 text-lg">{prayer.label}</span>
              <div className="relative flex items-center">
                <input
                  type="checkbox"
                  checked={todayRecord[prayer.id]}
                  onChange={(e) => updateSolat(prayer.id, e.target.checked)}
                  className="w-6 h-6 rounded-md border-stone-300 text-emerald-600 focus:ring-emerald-500"
                />
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Qada Tracker */}
      <div className="rounded-3xl bg-white p-6 shadow-sm border-2 border-stone-100">
        <div className="text-center">
          <p className="text-sm font-medium text-stone-500 uppercase tracking-wider">{lang === "en" ? "Qada Prayers" : "Solat Qada"}</p>
          <h3 className="mt-1 text-2xl font-bold text-stone-900">{lang === "en" ? "Replaced Today" : "Diganti Hari Ini"}</h3>
          
          <div className="mt-4 flex items-center justify-center gap-6">
            <button 
              onClick={() => updateSolat("qada_count", Math.max(0, todayRecord.qada_count - 1))}
              className="h-14 w-14 rounded-full bg-stone-100 text-2xl font-bold text-stone-600 hover:bg-stone-200"
            >
              -
            </button>
            
            <div className="w-24">
              <p className="text-5xl font-bold text-emerald-700">{todayRecord.qada_count}</p>
            </div>
            
            <button 
              onClick={() => updateSolat("qada_count", todayRecord.qada_count + 1)}
              className="h-14 w-14 rounded-full bg-emerald-100 text-2xl font-bold text-emerald-700 hover:bg-emerald-200"
            >
              +
            </button>
          </div>
        </div>
      </div>

    </div>
  );
}
