import { useEffect, useState, useMemo } from "react";
import { surahs } from "./data/surahs";
import { supabase } from "./supabase";
import Auth from "./Auth";
import SolatTracker from "./SolatTracker";

function getMalaysiaDateParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kuala_Lumpur",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = {};
  formatter.formatToParts(date).forEach(({ type, value }) => {
    if (type !== "literal") {
      parts[type] = value;
    }
  });

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
  };
}

function getMalaysiaDateKey(date = new Date()) {
  const { year, month, day } = getMalaysiaDateParts(date);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function addDaysToDateKey(dateKey, offset) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const utcDate = new Date(Date.UTC(year, month - 1, day));
  utcDate.setUTCDate(utcDate.getUTCDate() + offset);

  const nextYear = utcDate.getUTCFullYear();
  const nextMonth = String(utcDate.getUTCMonth() + 1).padStart(2, "0");
  const nextDay = String(utcDate.getUTCDate()).padStart(2, "0");

  return `${nextYear}-${nextMonth}-${nextDay}`;
}

function getNextReading(reading) {
  if (!reading) return null;

  const currentSurah = surahs.find(
    (surah) => surah.id === reading.surahId
  );

  if (!currentSurah) return null;

  if (reading.toAyah < currentSurah.ayahs) {
    return {
      surahId: currentSurah.id,
      surahName: currentSurah.name,
      arabicName: currentSurah.arabic,
      ayah: reading.toAyah + 1,
    };
  }

  if (currentSurah.id < 114) {
    const nextSurah = surahs.find(
      (surah) => surah.id === currentSurah.id + 1
    );

    return {
      surahId: nextSurah.id,
      surahName: nextSurah.name,
      arabicName: nextSurah.arabic,
      ayah: 1,
    };
  }

  return {
    finishedQuran: true,
  };
}

function App() {
  const [showRecord, setShowRecord] = useState(false);
  const [showContinue, setShowContinue] = useState(false);
  const [showLinkPopup, setShowLinkPopup] = useState(false);

  const [quranLink, setQuranLink] = useState(
    localStorage.getItem("quranAppLink") || "https://quran.com"
  );

  const [tempQuranLink, setTempQuranLink] = useState("");

  const [selectedSurah, setSelectedSurah] = useState("");
  const [fromAyah, setFromAyah] = useState("");
  const [toAyah, setToAyah] = useState("");
  const [source, setSource] = useState("physical");
  const [isStandalone, setIsStandalone] = useState(false);
  
  const [surahSearch, setSurahSearch] = useState("");
  const [isSurahDropdownOpen, setIsSurahDropdownOpen] = useState(false);
  const [quickAyah, setQuickAyah] = useState("");

  const [readingSessions, setReadingSessions] = useState([]);
  const [editingId, setEditingId] = useState(null);
  
  const [activeTab, setActiveTab] = useState("history");
  const [appMode, setAppMode] = useState("quran");
  
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [lang, setLang] = useState("en");

  // Toggle Dark Mode
  useEffect(() => {
    if (isDarkMode) document.documentElement.classList.add("dark");
    else document.documentElement.classList.remove("dark");
  }, [isDarkMode]);

  function openRecordForm(readingToEdit = null) {
    if (readingToEdit) {
      setEditingId(readingToEdit.id);
      setSelectedSurah(readingToEdit.surahId);
      setFromAyah(readingToEdit.fromAyah);
      setToAyah(readingToEdit.toAyah);
      setSource(readingToEdit.source);
      setIsStandalone(readingToEdit.isStandalone || false);
    } else {
      setEditingId(null);
      setSelectedSurah("");
      setFromAyah("");
      setToAyah("");
      setSource("physical");
      setIsStandalone(false);
    }
    setShowRecord(true);
  }

  // Add auth state
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setAuthLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  function formatSupabaseRow(item) {
    return {
      id: item.id,
      surahId: item.surah_id,
      surahName: item.surah_name,
      fromAyah: item.from_ayah,
      toAyah: item.to_ayah,
      source: item.source,
      isStandalone: item.is_standalone,
      date: item.date,
      createdAt: item.created_at
    };
  }

  // Load saved history from cache immediately
  useEffect(() => {
    const saved = localStorage.getItem("quranReadingSessions");
    if (saved) {
      setReadingSessions(JSON.parse(saved));
    }
  }, []);

  // Fetch history from Supabase
  const fetchSessions = async () => {
    if (!session) return;
    const { data, error } = await supabase
      .from('reading_sessions')
      .select('*')
      .order('created_at', { ascending: true });
      
    if (!error && data) {
      const formatted = data.map(formatSupabaseRow);
      setReadingSessions(formatted);
      localStorage.setItem("quranReadingSessions", JSON.stringify(formatted));
    }
  };

  useEffect(() => {
    if (!session) {
      setReadingSessions([]);
      localStorage.removeItem("quranReadingSessions");
      return;
    }
    fetchSessions();
  }, [session]);

  // Offline Queue logic
  const syncOfflineQueue = async () => {
    if (!navigator.onLine || !session) return;
    
    const queue = JSON.parse(localStorage.getItem('quranOfflineQueue') || '[]');
    if (queue.length === 0) return;
    
    for (const item of queue) {
      if (item.action === 'insert') {
        await supabase.from('reading_sessions').insert(item.payload);
      } else if (item.action === 'update') {
        const { id, ...updateData } = item.payload;
        await supabase.from('reading_sessions').update(updateData).eq('id', id);
      } else if (item.action === 'delete') {
        await supabase.from('reading_sessions').delete().eq('id', item.payload.id);
      }
    }
    
    localStorage.setItem('quranOfflineQueue', '[]');
    fetchSessions();
  };

  useEffect(() => {
    window.addEventListener('online', syncOfflineQueue);
    return () => window.removeEventListener('online', syncOfflineQueue);
  }, [session]);

  const addToOfflineQueue = (action, payload) => {
    const queue = JSON.parse(localStorage.getItem('quranOfflineQueue') || '[]');
    queue.push({ action, payload });
    localStorage.setItem('quranOfflineQueue', JSON.stringify(queue));
  };

  const updateLocalState = (newSessions) => {
    setReadingSessions(newSessions);
    localStorage.setItem("quranReadingSessions", JSON.stringify(newSessions));
  };

  const sequentialSessions = readingSessions.filter(r => !r.isStandalone);
  const lastReading =
    sequentialSessions.length > 0
      ? sequentialSessions[sequentialSessions.length - 1]
      : null;

  const nextReading = getNextReading(lastReading);

  useEffect(() => {
    if (nextReading) {
      setQuickAyah(nextReading.ayah);
    }
  }, [nextReading?.surahId, nextReading?.ayah]);

  const progressData = useMemo(() => {
    const readAyahsBySurah = {};
    surahs.forEach((s) => (readAyahsBySurah[s.id] = new Set()));

    let totalVolume = 0;
    const uniqueDates = new Set();
    const uniqueDateStrings = new Set();

    readingSessions.forEach((session) => {
      if (readAyahsBySurah[session.surahId]) {
        const from = Math.min(session.fromAyah, session.toAyah);
        const to = Math.max(session.fromAyah, session.toAyah);
        totalVolume += to - from + 1;
        for (let i = from; i <= to; i++) {
          readAyahsBySurah[session.surahId].add(i);
        }
      }

      const dateKey = getMalaysiaDateKey(new Date(session.createdAt || session.date));
      uniqueDates.add(dateKey);
      uniqueDateStrings.add(dateKey);
    });

    let totalAyahs = 0;
    let totalRead = 0;
    const surahProgress = surahs.map((s) => {
      const readCount = readAyahsBySurah[s.id].size;
      totalAyahs += s.ayahs;
      totalRead += readCount;
      return {
        ...s,
        readCount,
        percentage: s.ayahs > 0 ? Math.round((readCount / s.ayahs) * 100) : 0,
      };
    });

    // Streak Calculation
    let streak = 0;
    let todayKey = getMalaysiaDateKey();
    let checkKey = todayKey;

    if (uniqueDates.has(checkKey)) {
      streak++;
      checkKey = addDaysToDateKey(checkKey, -1);
    } else {
      checkKey = addDaysToDateKey(checkKey, -1);
      if (uniqueDates.has(checkKey)) {
        streak++;
        checkKey = addDaysToDateKey(checkKey, -1);
      }
    }

    while (streak > 0 && uniqueDates.has(checkKey)) {
      streak++;
      checkKey = addDaysToDateKey(checkKey, -1);
    }

    // Calendar for current month
    const currentYear = getMalaysiaDateParts().year;
    const currentMonth = getMalaysiaDateParts().month - 1;
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const firstDay = new Date(currentYear, currentMonth, 1).getDay();
    const startOffset = firstDay === 0 ? 6 : firstDay - 1; // Monday start

    const calendarDays = [];
    for (let i = 0; i < startOffset; i++) {
      calendarDays.push(null);
    }
    for (let i = 1; i <= daysInMonth; i++) {
      calendarDays.push(i);
    }

    const readingDaysThisMonth = new Set(
      readingSessions
        .map((s) => getMalaysiaDateKey(new Date(s.createdAt || s.date)))
        .filter((dateKey) => {
          const [year, month] = dateKey.split('-').map(Number);
          return year === currentYear && month - 1 === currentMonth;
        })
        .map((dateKey) => Number(dateKey.slice(8, 10)))
    );

    return {
      overallPercentage: totalAyahs > 0 ? Math.round((totalRead / totalAyahs) * 100) : 0,
      totalRead,
      totalAyahs,
      totalVolume,
      totalDays: uniqueDates.size,
      streak,
      currentYear,
      currentMonth,
      calendarDays,
      readingDaysThisMonth,
      surahProgress: surahProgress.filter((s) => s.readCount > 0),
    };
  }, [readingSessions, surahs]);

  async function handleQuickSave() {
    if (!nextReading || !quickAyah) return;
    
    const surah = surahs.find((s) => s.id === nextReading.surahId);
    if (quickAyah < nextReading.ayah) {
      alert(`Ayah must be at least ${nextReading.ayah}.`);
      return;
    }
    if (quickAyah > surah.ayahs) {
      alert(`${surah.name} only has ${surah.ayahs} ayahs.`);
      return;
    }

    const payload = {
      user_id: session.user.id,
      surah_id: surah.id,
      surah_name: surah.name,
      from_ayah: nextReading.ayah,
      to_ayah: quickAyah,
      source: lastReading ? lastReading.source : "physical",
      is_standalone: false,
      date: getMalaysiaDateKey()
    };

    const localReading = {
      id: crypto.randomUUID(), // optimistic ID
      surahId: payload.surah_id,
      surahName: payload.surah_name,
      fromAyah: payload.from_ayah,
      toAyah: payload.to_ayah,
      source: payload.source,
      isStandalone: payload.is_standalone,
      date: payload.date,
      createdAt: new Date().toISOString()
    };

    if (!navigator.onLine) {
      addToOfflineQueue('insert', payload);
      updateLocalState([...readingSessions, localReading]);
    } else {
      const { data, error } = await supabase
        .from('reading_sessions')
        .insert(payload)
        .select()
        .single();

      if (error) {
        addToOfflineQueue('insert', payload);
        updateLocalState([...readingSessions, localReading]);
      } else {
        updateLocalState([...readingSessions, formatSupabaseRow(data)]);
      }
    }
  }

  async function saveReading() {
    if (!selectedSurah || !fromAyah || !toAyah) {
      alert("Please fill in all fields.");
      return;
    }

    const surah = surahs.find(
      (item) => item.id === Number(selectedSurah)
    );

    const from = Number(fromAyah);
    const to = Number(toAyah);

    if (from < 1 || to < 1 || from > to) {
      alert("Please enter a valid ayah range.");
      return;
    }

    if (to > surah.ayahs) {
      alert(`${surah.name} only has ${surah.ayahs} ayahs.`);
      return;
    }

    if (editingId) {
      const payload = {
        surah_id: surah.id,
        surah_name: surah.name,
        from_ayah: from,
        to_ayah: to,
        source: source,
        is_standalone: isStandalone,
        id: editingId
      };
      
      const updatedLocal = readingSessions.map(r => 
        r.id === editingId ? {
          ...r,
          surahId: surah.id,
          surahName: surah.name,
          fromAyah: from,
          toAyah: to,
          source: source,
          isStandalone: isStandalone
        } : r
      );

      if (!navigator.onLine) {
        addToOfflineQueue('update', payload);
        updateLocalState(updatedLocal);
      } else {
        const { data, error } = await supabase
          .from('reading_sessions')
          .update(payload)
          .eq('id', editingId)
          .select()
          .single();

        if (error) {
          addToOfflineQueue('update', payload);
          updateLocalState(updatedLocal);
        } else {
          updateLocalState(readingSessions.map((r) => (r.id === editingId ? formatSupabaseRow(data) : r)));
        }
      }
      setEditingId(null);
    } else {
      const payload = {
        user_id: session.user.id,
        surah_id: surah.id,
        surah_name: surah.name,
        from_ayah: from,
        to_ayah: to,
        source: source,
        is_standalone: isStandalone,
        date: getMalaysiaDateKey()
      };
      
      const localReading = {
        id: crypto.randomUUID(),
        surahId: payload.surah_id,
        surahName: payload.surah_name,
        fromAyah: payload.from_ayah,
        toAyah: payload.to_ayah,
        source: payload.source,
        isStandalone: payload.is_standalone,
        date: payload.date,
        createdAt: new Date().toISOString()
      };

      if (!navigator.onLine) {
        addToOfflineQueue('insert', payload);
        updateLocalState([...readingSessions, localReading]);
      } else {
        const { data, error } = await supabase
          .from('reading_sessions')
          .insert(payload)
          .select()
          .single();

        if (error) {
          addToOfflineQueue('insert', payload);
          updateLocalState([...readingSessions, localReading]);
        } else {
          updateLocalState([...readingSessions, formatSupabaseRow(data)]);
        }
      }
    }

    setSelectedSurah("");
    setFromAyah("");
    setToAyah("");
    setSource("physical");
    setIsStandalone(false);
    setShowRecord(false);
    setShowContinue(false);
  }

  async function deleteReading(id) {
    const confirmed = confirm(
      "Are you sure you want to delete this reading?"
    );

    if (!confirmed) return;

    if (!navigator.onLine) {
      addToOfflineQueue('delete', { id });
      updateLocalState(readingSessions.filter((reading) => reading.id !== id));
    } else {
      const { error } = await supabase
        .from('reading_sessions')
        .delete()
        .eq('id', id);

      if (error) {
        addToOfflineQueue('delete', { id });
      }
      updateLocalState(readingSessions.filter((reading) => reading.id !== id));
    }
  }

  function buildQuranReadingUrl(reading) {
    if (!reading) return quranLink || "https://quran.com";

    const baseUrl = (quranLink || "https://quran.com").replace(/\/+$/, "");
    return `${baseUrl}/${reading.surahId}/${reading.ayah}`;
  }

  function saveQuranLink() {
    if (!tempQuranLink.trim()) {
      alert("Please enter a Quran link.");
      return;
    }

    localStorage.setItem("quranAppLink", tempQuranLink.trim());

    setQuranLink(tempQuranLink.trim());
    setShowLinkPopup(false);
  }

  // --------------------------------
  // AUTH SCREEN
  // --------------------------------
  if (authLoading) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center">
        <p className="text-stone-500 font-medium">Loading...</p>
      </div>
    );
  }

  if (!session) {
    return <Auth />;
  }

  // --------------------------------
  // CONTINUE READING SCREEN
  // --------------------------------

  if (showContinue) {
    return (
      <div className="min-h-screen bg-stone-50 px-4 py-8">
        <div className="mx-auto max-w-xl">

          {/* Back */}
          <button
            onClick={() => setShowContinue(false)}
            className="mb-6 text-sm font-medium text-stone-600"
          >
            ← Back
          </button>

          {/* Header */}
          <div className="mb-8 text-center">
            <div className="text-4xl">📖</div>

            <h1 className="mt-2 text-3xl font-bold text-stone-900">
              Continue Reading
            </h1>

            <p className="mt-2 text-stone-500">
              Choose where you want to read
            </p>
          </div>

          {/* Reading Location */}
          {nextReading && !nextReading.finishedQuran && (
            <div className="space-y-5">

              {/* Main Card */}
              <div className="rounded-3xl bg-white p-8 text-center shadow-sm">

                <p className="text-sm font-medium uppercase tracking-wider text-emerald-700">
                  Start From
                </p>

                <h2 className="mt-3 text-3xl font-bold text-stone-900">
                  {nextReading.surahName}
                </h2>

                <p className="mt-2 text-2xl text-stone-600">
                  {nextReading.arabicName}
                </p>

                <div className="mx-auto mt-6 inline-flex rounded-2xl bg-emerald-50 px-10 py-5">
                  <div>
                    <p className="text-sm text-emerald-700">
                      Ayah
                    </p>

                    <p className="text-5xl font-bold text-emerald-800">
                      {nextReading.ayah}
                    </p>
                  </div>
                </div>

              </div>

              {/* Physical Quran */}
              <button
                onClick={() => {
                  setShowContinue(false);
                }}
                className="w-full rounded-2xl border-2 border-stone-200 bg-white p-5 text-left shadow-sm hover:border-emerald-500"
              >
                <div className="flex items-center gap-4">

                  <div className="text-4xl">
                    📖
                  </div>

                  <div>
                    <h3 className="font-bold text-stone-900">
                      Physical Quran
                    </h3>

                    <p className="mt-1 text-sm text-stone-500">
                      Open your Mushaf and start from Ayah{" "}
                      {nextReading.ayah}
                    </p>
                  </div>

                </div>
              </button>

              {/* Quran App */}
              <button
                onClick={() => {
                  if (nextReading && !nextReading.finishedQuran) {
                    const readingUrl = buildQuranReadingUrl(nextReading);
                    window.open(readingUrl, "_blank", "noopener,noreferrer");
                    return;
                  }

                  setTempQuranLink(quranLink || "https://quran.com");
                  setShowLinkPopup(true);
                }}
                className="w-full rounded-2xl border-2 border-stone-200 bg-white p-5 text-left shadow-sm hover:border-emerald-500"
              >
                <div className="flex items-center gap-4">

                  <div className="text-4xl">
                    📱
                  </div>

                  <div className="flex-1">
                    <h3 className="font-bold text-stone-900">
                      Quran App
                    </h3>

                    <p className="mt-1 text-sm text-stone-500">
                      {nextReading && !nextReading.finishedQuran
                        ? `Open ${nextReading.surahName} Ayah ${nextReading.ayah}`
                        : quranLink
                          ? "Open your saved Quran link"
                          : "Insert your Quran app link first"}
                    </p>
                  </div>

                  <div className="text-stone-400">
                    →
                  </div>

                </div>
              </button>

              {/* Saved Link */}
              {quranLink && (
                <div className="rounded-2xl bg-stone-100 p-4">

                  <div className="flex items-center justify-between">

                    <div>
                      <p className="text-xs font-medium text-stone-500">
                        SAVED QURAN LINK
                      </p>

                      <p className="mt-1 max-w-xs truncate text-sm text-stone-700">
                        {quranLink}
                      </p>
                    </div>

                    <button
                      onClick={() => {
                        setTempQuranLink(quranLink);
                        setShowLinkPopup(true);
                      }}
                      className="text-sm font-semibold text-emerald-700"
                    >
                      Edit
                    </button>

                  </div>

                </div>
              )}

              {/* Update Location */}
              <button
                onClick={() => {
                  setShowContinue(false);
                  openRecordForm();
                }}
                className="w-full rounded-2xl border border-stone-300 bg-white px-6 py-4 font-semibold text-stone-700"
              >
                🔖 I’m Here — Update My Place
              </button>

            </div>
          )}

          {/* Completed */}
          {nextReading?.finishedQuran && (
            <div className="rounded-3xl bg-white p-8 text-center shadow-sm">

              <div className="text-5xl">
                🎉
              </div>

              <h2 className="mt-4 text-2xl font-bold">
                Quran Completed
              </h2>

              <p className="mt-2 text-stone-500">
                MashaAllah. You have reached the end of the Quran.
              </p>

            </div>
          )}

        </div>

        {/* LINK POPUP */}
        {showLinkPopup && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">

            <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl">

              {/* Popup Header */}
              <div className="flex items-start justify-between">

                <div>
                  <div className="text-3xl">
                    🔗
                  </div>

                  <h2 className="mt-2 text-xl font-bold text-stone-900">
                    Insert Quran Link
                  </h2>

                  <p className="mt-1 text-sm text-stone-500">
                    Paste the link to your Quran reading website or app.
                  </p>
                </div>

                <button
                  onClick={() => setShowLinkPopup(false)}
                  className="text-xl text-stone-400"
                >
                  ✕
                </button>

              </div>

              {/* Input */}
              <div className="mt-6">

                <label className="text-sm font-medium text-stone-700">
                  Quran Link
                </label>

                <input
                  type="url"
                  value={tempQuranLink}
                  onChange={(e) => setTempQuranLink(e.target.value)}
                  placeholder="https://..."
                  className="mt-2 w-full rounded-xl border border-stone-300 px-4 py-3 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
                />

              </div>

              {/* Example */}
              <div className="mt-3 rounded-xl bg-stone-50 p-3">

                <p className="text-xs text-stone-500">
                  Example:
                </p>

                <p className="mt-1 break-all text-xs text-stone-600">
                  https://quran.com/18
                </p>

              </div>

              {/* Buttons */}
              <div className="mt-6 flex gap-3">

                <button
                  onClick={() => setShowLinkPopup(false)}
                  className="flex-1 rounded-xl border border-stone-300 px-4 py-3 font-medium text-stone-700"
                >
                  Cancel
                </button>

                <button
                  onClick={saveQuranLink}
                  className="flex-1 rounded-xl bg-emerald-700 px-4 py-3 font-bold text-white"
                >
                  Save Link
                </button>

              </div>

            </div>

          </div>
        )}

      </div>
    );
  }

  // --------------------------------
  // MAIN HOME SCREEN
  // --------------------------------

  return (
    <div className="min-h-screen bg-stone-50 px-4 py-6 sm:py-8 pb-12">

      <div className="mx-auto max-w-xl">

        {/* Header */}
        <header className="mb-8 relative text-center">
          
          <div className="absolute top-0 left-0 flex gap-2">
            <button
              onClick={() => setIsDarkMode(!isDarkMode)}
              className="text-lg bg-stone-200 h-8 w-8 rounded-full flex items-center justify-center hover:bg-stone-300"
            >
              {isDarkMode ? "☀️" : "🌙"}
            </button>
            <button
              onClick={() => setLang(lang === "en" ? "ms" : "en")}
              className="text-xs font-bold bg-stone-200 h-8 w-8 rounded-full flex items-center justify-center hover:bg-stone-300 text-stone-700"
            >
              {lang === "en" ? "EN" : "MS"}
            </button>
          </div>

          <button 
            onClick={() => supabase.auth.signOut()}
            className="absolute top-0 right-0 text-xs font-medium text-stone-500 hover:text-stone-800 bg-stone-200 px-3 py-2 rounded-full"
          >
            {lang === "en" ? "Sign Out" : "Log Keluar"}
          </button>

          <div className="text-4xl mt-6 emoji">📖</div>

          <h1 className="mt-2 text-3xl font-bold text-stone-900">
            {lang === "en" ? "Quran Track" : "Jejak Quran"}
          </h1>

          <p className="mt-2 text-stone-500">
            {lang === "en" ? "Never forget where you stopped." : "Jangan lupa di mana anda berhenti."}
          </p>

        </header>

        {/* App Mode Switcher */}
        <div className="flex bg-stone-200 p-1 rounded-2xl mb-8">
          <button
            onClick={() => setAppMode("quran")}
            className={`flex-1 py-3 text-sm font-bold rounded-xl transition-colors ${appMode === "quran" ? "bg-white text-emerald-800 shadow-sm" : "text-stone-500 hover:text-stone-700"}`}
          >
            📖 Quran
          </button>
          <button
            onClick={() => setAppMode("solat")}
            className={`flex-1 py-3 text-sm font-bold rounded-xl transition-colors ${appMode === "solat" ? "bg-white text-emerald-800 shadow-sm" : "text-stone-500 hover:text-stone-700"}`}
          >
            🕌 Solat
          </button>
        </div>

        {appMode === "solat" && (
          <SolatTracker session={session} lang={lang} />
        )}

        {appMode === "quran" && (
          <>
            {/* Continue Reading */}
        <section className="rounded-3xl bg-emerald-800 p-6 text-white shadow-sm">

          <p className="text-sm font-medium text-emerald-200">
            {lang === "en" ? "CONTINUE READING" : "SAMBUNG BACAAN"}
          </p>

          {!lastReading && (
            <>
              <h2 className="mt-3 text-2xl font-bold">
                {lang === "en" ? "Start your Quran journey" : "Mulakan perjalanan Quran anda"}
              </h2>

              <p className="mt-2 text-emerald-100">
                {lang === "en" ? "Record your first reading location." : "Rekod lokasi bacaan pertama anda."}
              </p>
            </>
          )}

          {lastReading && nextReading?.finishedQuran && (
            <>
              <h2 className="mt-3 text-2xl font-bold">
                🎉 {lang === "en" ? "Quran Completed" : "Khatam Quran"}
              </h2>

              <p className="mt-2 text-emerald-100">
                {lang === "en" ? "You reached the end of the Quran." : "Anda telah sampai ke penghujung Quran."}
              </p>
            </>
          )}

          {lastReading && !nextReading?.finishedQuran && (
            <>
              <h2 className="mt-3 text-3xl font-bold">
                {nextReading.surahName}
              </h2>

              <p className="mt-1 text-emerald-200">
                {nextReading.arabicName}
              </p>

              <div className="mt-4">
                <p className="text-emerald-200">
                  Start from Ayah
                </p>

                <p className="text-4xl font-bold">
                  {nextReading.ayah}
                </p>
              </div>

              <p className="mt-4 text-sm text-emerald-200">
                Last read: {lastReading.surahName}{" "}
                {lastReading.fromAyah}–{lastReading.toAyah}
              </p>
            </>
          )}

          <button
            onClick={() => {
              if (!lastReading) {
                openRecordForm();
              } else {
                setShowContinue(true);
              }
            }}
            className="mt-6 w-full rounded-2xl bg-white px-6 py-4 font-bold text-emerald-800 shadow-sm hover:bg-emerald-50"
          >
            ▶ Continue Reading
          </button>

        </section>

        {/* Quick Save / I'm Here */}
        {nextReading && !nextReading.finishedQuran ? (
          <section className="mt-4 rounded-3xl bg-white p-6 shadow-sm border-2 border-stone-100">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-stone-900">🔖 Quick Save</h2>
              <button 
                onClick={() => openRecordForm()}
                className="text-sm font-medium text-emerald-700"
              >
                Full Form →
              </button>
            </div>
            
            <div className="text-center">
              <p className="text-sm font-medium text-stone-500">I stopped at</p>
              <h3 className="mt-1 text-2xl font-bold text-stone-900">{nextReading.surahName}</h3>
              
              <div className="mt-4 flex items-center justify-center gap-6">
                <button 
                  onClick={() => setQuickAyah(q => Math.max(nextReading.ayah, q - 1))}
                  className="h-12 w-12 rounded-full bg-stone-100 text-2xl font-bold text-stone-600 hover:bg-stone-200"
                >
                  -
                </button>
                
                <div className="w-24">
                  <p className="text-xs text-stone-400 mb-1">Ayah</p>
                  <input
                    type="number"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={quickAyah}
                    onChange={(e) => setQuickAyah(Number(e.target.value))}
                    className="no-spin w-full text-center text-4xl font-bold text-stone-900 outline-none bg-transparent"
                  />
                </div>
                
                <button 
                  onClick={() => {
                    const maxAyahs = surahs.find(s => s.id === nextReading.surahId)?.ayahs || 300;
                    setQuickAyah(q => Math.min(maxAyahs, q + 1));
                  }}
                  className="h-12 w-12 rounded-full bg-stone-100 text-2xl font-bold text-stone-600 hover:bg-stone-200"
                >
                  +
                </button>
              </div>
              
              <button
                onClick={handleQuickSave}
                className="mt-6 w-full rounded-xl bg-stone-900 px-5 py-4 font-bold text-white hover:bg-stone-800"
              >
                Save
              </button>
            </div>
          </section>
        ) : (
          <button
            onClick={() => openRecordForm()}
            className="mt-4 w-full rounded-2xl border-2 border-stone-200 bg-white px-6 py-4 font-semibold text-stone-700 shadow-sm hover:border-emerald-500"
          >
            🔖 I’m Here
          </button>
        )}

        {/* Quick Bookmarks */}
        <section className="mt-4 overflow-x-auto pb-2">
          <div className="flex gap-3 px-1">
            <a href="https://quran.com/ya-sin" target="_blank" rel="noopener noreferrer" className="shrink-0 flex items-center gap-2 rounded-xl bg-white px-4 py-3 shadow-sm border border-stone-100 hover:bg-stone-50 hover:border-emerald-200 transition-colors">
              <span className="text-xl">📖</span>
              <span className="font-bold text-stone-700 text-sm">Ya-Sin</span>
            </a>
            <a href="https://quran.com/al-waqiah" target="_blank" rel="noopener noreferrer" className="shrink-0 flex items-center gap-2 rounded-xl bg-white px-4 py-3 shadow-sm border border-stone-100 hover:bg-stone-50 hover:border-emerald-200 transition-colors">
              <span className="text-xl">📖</span>
              <span className="font-bold text-stone-700 text-sm">Al-Waqi'ah</span>
            </a>
            <a href="https://quran.com/al-mulk" target="_blank" rel="noopener noreferrer" className="shrink-0 flex items-center gap-2 rounded-xl bg-white px-4 py-3 shadow-sm border border-stone-100 hover:bg-stone-50 hover:border-emerald-200 transition-colors">
              <span className="text-xl">📖</span>
              <span className="font-bold text-stone-700 text-sm">Al-Mulk</span>
            </a>
            <a href="https://quran.com/al-kahf" target="_blank" rel="noopener noreferrer" className="shrink-0 flex items-center gap-2 rounded-xl bg-white px-4 py-3 shadow-sm border border-stone-100 hover:bg-stone-50 hover:border-emerald-200 transition-colors">
              <span className="text-xl">📖</span>
              <span className="font-bold text-stone-700 text-sm">Al-Kahf</span>
            </a>
          </div>
        </section>

        {/* Record Form */}
        {showRecord && (
          <section className="mt-6 rounded-3xl bg-white p-6 shadow-sm">

            <div className="flex items-center justify-between">

              <h2 className="text-xl font-bold text-stone-900">
                {editingId ? "Edit Reading" : "Record My Place"}
              </h2>

              <button
                onClick={() => {
                  setShowRecord(false);
                  setEditingId(null);
                  setSelectedSurah("");
                  setFromAyah("");
                  setToAyah("");
                  setSource("physical");
                  setIsStandalone(false);
                }}
                className="text-stone-400 hover:text-stone-700"
              >
                ✕
              </button>

            </div>

            {/* Surah */}
            <div className="mt-6 relative">
              <label className="text-sm font-medium text-stone-700">
                Surah
              </label>

              <div className="relative mt-2">
                <div 
                  onClick={() => setIsSurahDropdownOpen(!isSurahDropdownOpen)}
                  className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3 flex justify-between items-center cursor-pointer"
                >
                  <span className={selectedSurah ? "text-stone-900" : "text-stone-500"}>
                    {selectedSurah 
                      ? `${selectedSurah}. ${surahs.find(s => s.id === Number(selectedSurah))?.name}` 
                      : "Select a Surah"}
                  </span>
                  <span className="text-stone-400 text-xs">▼</span>
                </div>

                {isSurahDropdownOpen && (
                  <div className="absolute z-10 mt-2 w-full rounded-xl border border-stone-200 bg-white shadow-lg overflow-hidden">
                    <div className="p-2 border-b border-stone-100">
                      <input
                        type="text"
                        placeholder="🔍 Search Surah..."
                        value={surahSearch}
                        onChange={(e) => setSurahSearch(e.target.value)}
                        className="w-full rounded-lg bg-stone-50 px-3 py-2 outline-none focus:bg-stone-100"
                        autoFocus
                      />
                    </div>
                    <div className="max-h-60 overflow-y-auto">
                      {surahs
                        .filter(surah => surah.name.toLowerCase().includes(surahSearch.toLowerCase()) || surah.id.toString() === surahSearch)
                        .map(surah => (
                          <div 
                            key={surah.id}
                            onClick={() => {
                              setSelectedSurah(surah.id);
                              if (isStandalone) {
                                setFromAyah(1);
                                setToAyah(surah.ayahs);
                              } else {
                                setFromAyah("");
                                setToAyah("");
                              }
                              setIsSurahDropdownOpen(false);
                              setSurahSearch("");
                            }}
                            className="px-4 py-3 hover:bg-stone-50 cursor-pointer text-stone-800"
                          >
                            {surah.id}. {surah.name}
                          </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Ayah */}
            <div className="mt-5 grid grid-cols-2 gap-3">

              <div>
                <label className="text-sm font-medium text-stone-700">
                  From Ayah
                </label>

                <input
                  type="number"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  min="1"
                  placeholder={selectedSurah ? `1` : ""}
                  value={fromAyah}
                  onChange={(e) => setFromAyah(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-stone-300 px-4 py-3 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 text-lg"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-stone-700">
                  To Ayah
                </label>

                <input
                  type="number"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  min="1"
                  placeholder={selectedSurah ? `Max: ${surahs.find(s => s.id === Number(selectedSurah))?.ayahs}` : ""}
                  value={toAyah}
                  onChange={(e) => setToAyah(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-stone-300 px-4 py-3 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 text-lg"
                />
              </div>

            </div>

            {/* Source */}
            <div className="mt-5">

              <label className="text-sm font-medium text-stone-700">
                I read from
              </label>

              <div className="mt-2 grid grid-cols-2 gap-3">

                <button
                  onClick={() => setSource("physical")}
                  className={`rounded-xl border-2 p-4 ${
                    source === "physical"
                      ? "border-emerald-600 bg-emerald-50"
                      : "border-stone-200"
                  }`}
                >
                  📖
                  <div className="mt-1 text-sm font-medium">
                    Physical Quran
                  </div>
                </button>

                <button
                  onClick={() => setSource("app")}
                  className={`rounded-xl border-2 p-4 ${
                    source === "app"
                      ? "border-emerald-600 bg-emerald-50"
                      : "border-stone-200"
                  }`}
                >
                  📱
                  <div className="mt-1 text-sm font-medium">
                    Quran App
                  </div>
                </button>

              </div>

            </div>

            {/* Type */}
            <div className="mt-5">
              <label className="text-sm font-medium text-stone-700">
                Reading Type
              </label>
              <div className="mt-2 grid grid-cols-2 gap-3">
                <button
                  onClick={() => setIsStandalone(false)}
                  className={`rounded-xl border-2 p-3 text-left ${
                    !isStandalone
                      ? "border-emerald-600 bg-emerald-50"
                      : "border-stone-200"
                  }`}
                >
                  <div className="text-sm font-bold text-stone-900">Main Progress</div>
                  <div className="mt-1 text-xs text-stone-500">Updates next reading</div>
                </button>
                <button
                  onClick={() => {
                    setIsStandalone(true);
                    if (selectedSurah) {
                      const surah = surahs.find(s => s.id === Number(selectedSurah));
                      if (surah) {
                        setFromAyah(1);
                        setToAyah(surah.ayahs);
                      }
                    }
                  }}
                  className={`rounded-xl border-2 p-3 text-left ${
                    isStandalone
                      ? "border-emerald-600 bg-emerald-50"
                      : "border-stone-200"
                  }`}
                >
                  <div className="text-sm font-bold text-stone-900">Standalone</div>
                  <div className="mt-1 text-xs text-stone-500">e.g. Daily Yasin</div>
                </button>
              </div>
            </div>

            {/* Save */}
            <button
              onClick={saveReading}
              className="mt-6 w-full rounded-xl bg-emerald-700 px-5 py-3 font-bold text-white hover:bg-emerald-800"
            >
              {editingId ? "Save Changes" : "Save My Place"}
            </button>

            <button
              onClick={() => {
                setShowRecord(false);
                setEditingId(null);
                setSelectedSurah("");
                setFromAyah("");
                setToAyah("");
                setSource("physical");
                setIsStandalone(false);
              }}
              className="mt-2 w-full rounded-xl px-5 py-3 text-stone-500"
            >
              Cancel
            </button>

          </section>
        )}

        {/* Tabs */}
        <div className="flex border-b border-stone-200 mt-8 mb-4">
          <button 
            className={`flex-1 py-3 text-center font-medium ${activeTab === 'history' ? 'border-b-2 border-emerald-600 text-emerald-700' : 'text-stone-500 hover:text-stone-700'}`}
            onClick={() => setActiveTab('history')}
          >
            History
          </button>
          <button 
            className={`flex-1 py-3 text-center font-medium ${activeTab === 'progress' ? 'border-b-2 border-emerald-600 text-emerald-700' : 'text-stone-500 hover:text-stone-700'}`}
            onClick={() => setActiveTab('progress')}
          >
            Progress
          </button>
          <button 
            className={`flex-1 py-3 text-center font-medium ${activeTab === 'settings' ? 'border-b-2 border-emerald-600 text-emerald-700' : 'text-stone-500 hover:text-stone-700'}`}
            onClick={() => setActiveTab('settings')}
          >
            Settings
          </button>
        </div>

        {/* History */}
        {activeTab === 'history' && (
          <section className="mt-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-stone-900">
                Reading History
              </h2>
              <span className="rounded-full bg-stone-200 px-3 py-1 text-sm text-stone-600">
                {readingSessions.length}
              </span>
            </div>

            {readingSessions.length === 0 && (
              <div className="mt-4 rounded-2xl bg-white p-6 text-center text-stone-500">
                No reading history yet.
              </div>
            )}

            <div className="mt-4 space-y-3">
              {[...readingSessions].reverse().map((reading) => (
                <div
                  key={reading.id}
                  className="rounded-2xl bg-white p-5 shadow-sm"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-bold text-stone-900 flex items-center gap-2">
                        {reading.surahName}
                        {reading.isStandalone && (
                          <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500 bg-stone-100 px-2 py-0.5 rounded-full">
                            Standalone
                          </span>
                        )}
                      </h3>
                      <p className="mt-1 text-lg font-semibold text-emerald-700">
                        Ayah {reading.fromAyah}–{reading.toAyah}
                      </p>
                      <p className="mt-2 text-sm text-stone-500">
                        {reading.source === "physical"
                          ? "📖 Physical Quran"
                          : "📱 Quran App"}
                      </p>
                      <p className="mt-1 text-xs text-stone-400">
                        {reading.date}
                      </p>
                    </div>

                    <div className="flex flex-col gap-2 items-end">
                      <button
                        onClick={() => openRecordForm(reading)}
                        className="text-sm text-stone-500 hover:text-emerald-700"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => deleteReading(reading.id)}
                        className="text-sm text-red-500 hover:text-red-700"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Progress & Stats */}
        {activeTab === 'progress' && (
          <section className="mt-4">
            
            {/* Reading Statistics */}
            <h2 className="text-xl font-bold text-stone-900 mb-4">Your Reading</h2>
            <div className="grid grid-cols-2 gap-3 mb-6">
              <div className="rounded-2xl bg-white p-4 shadow-sm flex flex-col justify-center items-center text-center">
                <span className="text-2xl mb-1">📖</span>
                <p className="font-bold text-stone-900 text-lg">{readingSessions.length}</p>
                <p className="text-xs text-stone-500 uppercase tracking-wide">Sessions</p>
              </div>
              <div className="rounded-2xl bg-white p-4 shadow-sm flex flex-col justify-center items-center text-center">
                <span className="text-2xl mb-1">📜</span>
                <p className="font-bold text-stone-900 text-lg">{progressData.totalVolume.toLocaleString()}</p>
                <p className="text-xs text-stone-500 uppercase tracking-wide">Ayahs</p>
              </div>
              <div className="rounded-2xl bg-white p-4 shadow-sm flex flex-col justify-center items-center text-center">
                <span className="text-2xl mb-1">📅</span>
                <p className="font-bold text-stone-900 text-lg">{progressData.totalDays}</p>
                <p className="text-xs text-stone-500 uppercase tracking-wide">Days</p>
              </div>
              <div className="rounded-2xl bg-white p-4 shadow-sm flex flex-col justify-center items-center text-center">
                <span className="text-2xl mb-1">📊</span>
                <p className="font-bold text-stone-900 text-lg">{progressData.overallPercentage}%</p>
                <p className="text-xs text-stone-500 uppercase tracking-wide">Quran</p>
              </div>
            </div>

            {/* Streak (Optional) */}
            {progressData.streak > 0 && (
              <div className="rounded-2xl bg-orange-50 border border-orange-100 p-4 mb-6 flex items-center gap-3">
                <span className="text-3xl">🔥</span>
                <div>
                  <h3 className="font-bold text-orange-900 text-lg">{progressData.streak} Day Streak</h3>
                  <p className="text-sm text-orange-700">Keep up the great work!</p>
                </div>
              </div>
            )}

            {/* Reading Calendar */}
            <h2 className="text-xl font-bold text-stone-900 mb-4">Reading Calendar</h2>
            <div className="rounded-3xl bg-white p-6 shadow-sm mb-8">
              <h3 className="font-bold text-stone-800 text-center mb-4">
                {new Date(progressData.currentYear, progressData.currentMonth).toLocaleString('default', { month: 'long', year: 'numeric' })}
              </h3>
              <div className="grid grid-cols-7 gap-1 text-center">
                {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map(day => (
                  <div key={day} className="text-xs font-medium text-stone-400 mb-2">{day}</div>
                ))}
                {progressData.calendarDays.map((day, idx) => (
                  <div key={idx} className="aspect-square flex items-center justify-center">
                    {day ? (
                      <span className={`w-8 h-8 flex items-center justify-center rounded-full text-sm ${progressData.readingDaysThisMonth.has(day) ? 'bg-emerald-100 text-emerald-700 font-bold border border-emerald-200' : 'text-stone-600'}`}>
                        {day}
                      </span>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>

            {/* Overall Progress */}
            <h2 className="text-xl font-bold text-stone-900 mb-4">Overall Progress</h2>
            <div className="rounded-3xl bg-white p-6 shadow-sm mb-8">
              <p className="text-sm font-medium uppercase tracking-wider text-emerald-700 mb-2">
                Quran Progress
              </p>
              
              <div className="flex justify-between items-end mb-2">
                <h3 className="text-3xl font-bold text-stone-900">{progressData.overallPercentage}%</h3>
                <p className="text-stone-500 text-sm">
                  {progressData.totalRead.toLocaleString()} / {progressData.totalAyahs.toLocaleString()} Ayahs
                </p>
              </div>
              
              <div className="h-4 w-full bg-stone-100 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-emerald-500 rounded-full"
                  style={{ width: `${progressData.overallPercentage}%` }}
                ></div>
              </div>
              
              <div className="mt-4 text-sm text-stone-600 bg-emerald-50 rounded-xl p-3">
                <p>💡 Progress is calculated based on unique Ayahs read to prevent double counting.</p>
              </div>
            </div>

            {/* Surah Progress */}
            <h2 className="text-xl font-bold text-stone-900 mb-4">Surah Progress</h2>
            
            {progressData.surahProgress.length === 0 ? (
              <div className="rounded-2xl bg-white p-6 text-center text-stone-500">
                Start reading to see your progress here.
              </div>
            ) : (
              <div className="space-y-3">
                {progressData.surahProgress.map((surah) => (
                  <div key={surah.id} className="rounded-2xl bg-white p-5 shadow-sm">
                    <div className="flex justify-between items-center mb-2">
                      <h3 className="font-bold text-stone-900">{surah.name}</h3>
                      <span className="text-sm font-medium text-emerald-700">{surah.percentage}%</span>
                    </div>
                    
                    <div className="h-2 w-full bg-stone-100 rounded-full overflow-hidden mb-2">
                      <div 
                        className="h-full bg-emerald-500 rounded-full"
                        style={{ width: `${surah.percentage}%` }}
                      ></div>
                    </div>
                    
                    <p className="text-xs text-stone-500 text-right">
                      {surah.readCount} / {surah.ayahs} Ayahs
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Settings */}
        {activeTab === 'settings' && (
          <section className="mt-4">
            <h2 className="text-xl font-bold text-stone-900 mb-4">Settings</h2>
            
            <div className="rounded-3xl bg-white p-6 shadow-sm mb-6 space-y-6">
              
              <div>
                <h3 className="font-bold text-stone-900 mb-2">Data</h3>
                <div className="flex gap-3">
                  <button 
                    onClick={() => {
                      const dataStr = JSON.stringify(readingSessions, null, 2);
                      const blob = new Blob([dataStr], { type: "application/json" });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = "quran-track.json";
                      a.click();
                    }}
                    className="flex-1 rounded-xl bg-stone-100 px-4 py-3 font-medium text-stone-700 hover:bg-stone-200"
                  >
                    Export My Data
                  </button>
                  
                  <label className="flex-1 rounded-xl bg-stone-100 px-4 py-3 font-medium text-stone-700 hover:bg-stone-200 text-center cursor-pointer">
                    Import Data
                    <input 
                      type="file" 
                      accept=".json" 
                      className="hidden" 
                      onChange={(e) => {
                        const file = e.target.files[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = async (ev) => {
                          try {
                            const json = JSON.parse(ev.target.result);
                            if (Array.isArray(json)) {
                              const payload = json.map(item => ({
                                user_id: session.user.id,
                                surah_id: item.surahId,
                                surah_name: item.surahName,
                                from_ayah: item.fromAyah,
                                to_ayah: item.toAyah,
                                source: item.source,
                                is_standalone: item.isStandalone,
                                date: item.date,
                                created_at: item.createdAt || new Date().toISOString()
                              }));
                              const { error } = await supabase.from('reading_sessions').insert(payload);
                              if (!error) {
                                fetchSessions();
                                alert("Import successful!");
                              } else alert(error.message);
                            }
                          } catch (err) {
                            alert("Invalid JSON file");
                          }
                        };
                        reader.readAsText(file);
                      }}
                    />
                  </label>
                </div>
              </div>

              <div className="pt-6 border-t border-stone-100">
                <h3 className="font-bold text-stone-900 mb-2">Danger Zone</h3>
                <div className="flex flex-col gap-3">
                  <button 
                    onClick={async () => {
                      if (confirm("Are you sure you want to completely delete your reading history? This cannot be undone.")) {
                        const { error } = await supabase.from('reading_sessions').delete().eq('user_id', session.user.id);
                        if (!error) {
                          setReadingSessions([]);
                          alert("History deleted.");
                        } else alert(error.message);
                      }
                    }}
                    className="w-full rounded-xl border border-red-200 bg-red-50 px-4 py-3 font-medium text-red-700 hover:bg-red-100"
                  >
                    Delete Reading History
                  </button>
                  <button 
                    onClick={async () => {
                      if (confirm("Delete Account? This will delete all your reading data and sign you out.")) {
                        await supabase.from('reading_sessions').delete().eq('user_id', session.user.id);
                        setReadingSessions([]);
                        supabase.auth.signOut();
                      }
                    }}
                    className="w-full rounded-xl bg-red-700 px-4 py-3 font-bold text-white hover:bg-red-800"
                  >
                    Delete Account
                  </button>
                </div>
              </div>

            </div>
          </section>
        )}
        </>)}

      </div>
    </div>
  );
}

export default App;