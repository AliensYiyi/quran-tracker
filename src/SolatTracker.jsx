import { useState, useEffect, useMemo } from "react";
import { supabase } from "./supabase";

export default function SolatTracker({ session, lang }) {
  const [solatRecords, setSolatRecords] = useState([]);
  const [waktuSolat, setWaktuSolat] = useState(null);
  const [loading, setLoading] = useState(true);

  // Today's local date string (e.g. "2026-09-17")
  const todayDateStr = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD format

  const [city, setCity] = useState(() => localStorage.getItem("solat_city") || "Kuala Lumpur");
  const [country, setCountry] = useState(() => localStorage.getItem("solat_country") || "Malaysia");
  const [isEditingLocation, setIsEditingLocation] = useState(false);
  const [tempCity, setTempCity] = useState(city);
  const [tempCountry, setTempCountry] = useState(country);

  useEffect(() => {
    fetchWaktuSolat();
    if (session) {
      fetchSolatRecords();
    }
  }, [session, city, country]);

  const fetchWaktuSolat = async () => {
    try {
      // method=17 is Jabatan Kemajuan Islam Malaysia (JAKIM)
      const res = await fetch(`https://api.aladhan.com/v1/timingsByCity?city=${encodeURIComponent(city)}&country=${encodeURIComponent(country)}&method=17`);
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

  const saveLocation = () => {
    setCity(tempCity);
    setCountry(tempCountry);
    localStorage.setItem("solat_city", tempCity);
    localStorage.setItem("solat_country", tempCountry);
    setIsEditingLocation(false);
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
        qada_subuh: 0,
        qada_zohor: 0,
        qada_asar: 0,
        qada_maghrib: 0,
        qada_isyak: 0,
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

  // Dashboard Stats Breakdown
  const dashboardStats = useMemo(() => {
    const stats = {
      subuh: { missed: 0, qada: 0 },
      zohor: { missed: 0, qada: 0 },
      asar: { missed: 0, qada: 0 },
      maghrib: { missed: 0, qada: 0 },
      isyak: { missed: 0, qada: 0 },
    };

    let totalMissed = 0;
    let totalQada = 0;

    solatRecords.forEach(r => {
      // Missed
      if (!r.subuh) { stats.subuh.missed++; totalMissed++; }
      if (!r.zohor) { stats.zohor.missed++; totalMissed++; }
      if (!r.asar) { stats.asar.missed++; totalMissed++; }
      if (!r.maghrib) { stats.maghrib.missed++; totalMissed++; }
      if (!r.isyak) { stats.isyak.missed++; totalMissed++; }

      // Qada done (assuming new columns qada_subuh, qada_zohor, etc.)
      stats.subuh.qada += (r.qada_subuh || 0);
      stats.zohor.qada += (r.qada_zohor || 0);
      stats.asar.qada += (r.qada_asar || 0);
      stats.maghrib.qada += (r.qada_maghrib || 0);
      stats.isyak.qada += (r.qada_isyak || 0);
      
      totalQada += ((r.qada_subuh || 0) + (r.qada_zohor || 0) + (r.qada_asar || 0) + (r.qada_maghrib || 0) + (r.qada_isyak || 0));
    });

    return { stats, totalMissed, totalQada, netRemaining: Math.max(0, totalMissed - totalQada) };
  }, [solatRecords]);

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
          qada_subuh: newRecord.qada_subuh,
          qada_zohor: newRecord.qada_zohor,
          qada_asar: newRecord.qada_asar,
          qada_maghrib: newRecord.qada_maghrib,
          qada_isyak: newRecord.qada_isyak,
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
      
      {/* Dashboard Summary */}
      <div className="rounded-3xl bg-white p-6 shadow-sm border-2 border-stone-100">
        <h2 className="text-xl font-bold text-stone-900 mb-4">{lang === "en" ? "Solat Dashboard" : "Papan Pemuka Solat"}</h2>
        
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-red-50 rounded-2xl p-4 text-center">
            <p className="text-sm font-medium text-red-800">{lang === "en" ? "Missed" : "Tertinggal"}</p>
            <p className="text-3xl font-bold text-red-600 mt-1">{dashboardStats.missed}</p>
          </div>
          <div className="bg-emerald-50 rounded-2xl p-4 text-center">
            <p className="text-sm font-medium text-emerald-800">{lang === "en" ? "Qada Done" : "Qada Selesai"}</p>
            <p className="text-3xl font-bold text-emerald-600 mt-1">{dashboardStats.qadaDone}</p>
          </div>
        </div>
        
        <div className={`mt-3 rounded-2xl p-4 text-center ${dashboardStats.netRemaining === 0 ? 'bg-emerald-100' : 'bg-stone-100'}`}>
          <p className="text-sm font-medium text-stone-600">{lang === "en" ? "Remaining to Qada" : "Baki Perlu Qada"}</p>
          <p className={`text-4xl font-bold mt-1 ${dashboardStats.netRemaining === 0 ? 'text-emerald-700' : 'text-stone-900'}`}>
            {dashboardStats.netRemaining}
          </p>
          {dashboardStats.netRemaining === 0 && (
            <p className="text-xs font-bold text-emerald-600 mt-1 uppercase tracking-widest">{lang === "en" ? "All Clear!" : "Selesai Semua!"}</p>
          )}
        </div>
      </div>

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
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-bold">{lang === "en" ? "Waktu Solat" : "Waktu Solat"}</h2>
          <button onClick={() => setIsEditingLocation(true)} className="text-sm font-medium text-emerald-200 hover:text-white underline decoration-emerald-500/50">
            {city}, {country}
          </button>
        </div>
        
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

      {isEditingLocation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl">
            <h2 className="text-xl font-bold text-stone-900 mb-4">{lang === "en" ? "Edit Location" : "Tukar Lokasi"}</h2>
            
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-stone-700">City</label>
                <input
                  type="text"
                  value={tempCity}
                  onChange={(e) => setTempCity(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-stone-300 px-4 py-3 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-stone-700">Country</label>
                <input
                  type="text"
                  value={tempCountry}
                  onChange={(e) => setTempCountry(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-stone-300 px-4 py-3 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
                />
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setIsEditingLocation(false)}
                className="flex-1 rounded-xl border border-stone-300 px-4 py-3 font-medium text-stone-700"
              >
                {lang === "en" ? "Cancel" : "Batal"}
              </button>
              <button
                onClick={saveLocation}
                className="flex-1 rounded-xl bg-emerald-700 px-4 py-3 font-bold text-white"
              >
                {lang === "en" ? "Save" : "Simpan"}
              </button>
            </div>
          </div>
        </div>
      )}

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

      {/* Qada Tracker Breakdown */}
      <div className="rounded-3xl bg-white p-6 shadow-sm border-2 border-stone-100">
        <div className="text-center mb-6">
          <p className="text-sm font-medium text-stone-500 uppercase tracking-wider">{lang === "en" ? "Qada Prayers" : "Solat Qada"}</p>
          <h3 className="mt-1 text-2xl font-bold text-stone-900">{lang === "en" ? "Replaced Today" : "Diganti Hari Ini"}</h3>
        </div>
        
        <div className="space-y-4">
          {prayers.map((prayer) => {
            const qadaField = `qada_${prayer.id}`;
            const missedCount = dashboardStats.stats[prayer.id].missed;
            const qadaDoneTotal = dashboardStats.stats[prayer.id].qada;
            const remaining = Math.max(0, missedCount - qadaDoneTotal);

            return (
              <div key={prayer.id} className="flex items-center justify-between p-3 rounded-2xl bg-stone-50 border border-stone-100">
                <div>
                  <span className="font-bold text-stone-800 block">{prayer.label}</span>
                  <span className={`text-xs font-semibold mt-1 block ${remaining === 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                    {remaining} {lang === "en" ? "left" : "baki"}
                  </span>
                </div>
                
                <div className="flex items-center gap-4">
                  <button 
                    onClick={() => updateSolat(qadaField, Math.max(0, todayRecord[qadaField] - 1))}
                    className="h-10 w-10 rounded-full bg-stone-200 text-lg font-bold text-stone-600 hover:bg-stone-300"
                  >
                    -
                  </button>
                  
                  <div className="w-8 text-center">
                    <p className="text-xl font-bold text-emerald-700">{todayRecord[qadaField]}</p>
                  </div>
                  
                  <button 
                    onClick={() => updateSolat(qadaField, todayRecord[qadaField] + 1)}
                    className="h-10 w-10 rounded-full bg-emerald-100 text-lg font-bold text-emerald-700 hover:bg-emerald-200"
                  >
                    +
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
}

