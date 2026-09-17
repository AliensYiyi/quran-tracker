import { useState, useEffect, useRef } from "react";
import { normalizeArabic } from "../../utils/normalizeArabic";

export default function TasmikScreen({ surah, surahText, lang, onBack }) {
  const [currentAyahIndex, setCurrentAyahIndex] = useState(0);
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [spokenWordsState, setSpokenWordsState] = useState([]);
  const [status, setStatus] = useState("idle"); // 'idle', 'listening', 'correct', 'wrong'
  const [clueRequested, setClueRequested] = useState(false);
  const [analysisRequested, setAnalysisRequested] = useState(false);
  
  const recognitionRef = useRef(null);

  useEffect(() => {
    // Initialize Web Speech API
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.lang = "ar-SA"; // Saudi Arabia Arabic for best Quranic match
      recognition.continuous = true;
      recognition.interimResults = true;

      recognition.onstart = () => {
        setIsListening(true);
        setStatus("listening");
        setAnalysisRequested(false);
      };

      recognition.onresult = (event) => {
        let finalTranscript = "";
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
            handleFinalTranscript(event.results[i][0].transcript);
          } else {
            setTranscript(event.results[i][0].transcript);
          }
        }
      };

      recognition.onerror = (event) => {
        console.error("Speech recognition error", event.error);
        setIsListening(false);
        setStatus("idle");
      };

      recognition.onend = () => {
        setIsListening(false);
        if (status === "listening") setStatus("idle");
      };

      recognitionRef.current = recognition;
    } else {
      alert("Voice recognition is not supported in this browser. Please use Chrome or Safari.");
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, [currentAyahIndex]);

  const handleFinalTranscript = (spokenText) => {
    setTranscript(spokenText);
    
    if (currentAyahIndex >= surahText.length) return;
    
    const expectedAyah = surahText[currentAyahIndex].text;
    const normSpoken = normalizeArabic(spokenText);
    const normExpected = normalizeArabic(expectedAyah);

    const spokenWords = normSpoken.split(" ");
    setSpokenWordsState(spokenWords);
    
    const expectedWords = normExpected.split(" ");
    
    let matchCount = 0;
    expectedWords.forEach(word => {
      // Very forgiving: check if any spoken word is a substring of the expected word, or vice-versa
      // We lower the length requirement to 2 characters so short words can pass
      if (spokenWords.some(w => w === word || (w.length >= 2 && word.includes(w)) || (word.length >= 2 && w.includes(word)))) {
        matchCount++;
      }
    });

    const matchPercentage = matchCount / expectedWords.length;

    // Is it a very short ayah? (1 or 2 words, like Al-Qariah or Wal-Asr)
    const isShortAyah = expectedWords.length <= 2;

    // Extremely forgiving threshold:
    // - If it's a short ayah, just ONE matched word passes it.
    // - Otherwise, pass if they match 25% of words, OR get at least 2 words right,
    // - OR if the spoken text contains the expected text.
    if ((isShortAyah && matchCount >= 1) || matchPercentage >= 0.25 || matchCount >= 2 || normSpoken.includes(normExpected)) {
      markCorrect();
    } else {
      setStatus("wrong");
    }
  };

  const markCorrect = () => {
    setStatus("correct");
    // Wait a moment then move to next ayah
    setTimeout(() => {
      setCurrentAyahIndex(prev => prev + 1);
      setStatus("idle");
      setTranscript("");
      setSpokenWordsState([]);
      setClueRequested(false);
      setAnalysisRequested(false);
    }, 1500);
  };

  const toggleListen = () => {
    if (isListening) {
      recognitionRef.current?.stop();
    } else {
      setTranscript("");
      setStatus("idle");
      recognitionRef.current?.start();
    }
  };

  const playAudio = (globalAyah) => {
    // If microphone is listening, stop it so it doesn't hear the audio
    if (isListening) {
      recognitionRef.current?.stop();
    }
    
    const audio = new Audio(`https://cdn.islamic.network/quran/audio/128/ar.alafasy/${globalAyah}.mp3`);
    audio.play();
  };

  return (
    <div className="space-y-6 pb-20">
      <div className="flex justify-between items-center">
        <button 
          onClick={onBack} 
          className="flex items-center gap-2 text-sm font-bold text-stone-500 hover:text-emerald-700 bg-stone-200 px-4 py-2 rounded-full"
        >
          &larr; {lang === "en" ? "Exit Tasmik" : "Keluar Tasmik"}
        </button>
      </div>

      <div className="text-center bg-emerald-800 text-white rounded-3xl p-6 shadow-sm">
        <h2 className="text-3xl font-bold mb-1">{surah.arabic}</h2>
        <p className="text-emerald-200 font-medium">Tasmik Mode</p>
      </div>

      {/* Microphone Controls */}
      <div className="flex flex-col items-center justify-center p-6 bg-white rounded-3xl shadow-sm border-2 border-stone-100">
        <button 
          onClick={toggleListen}
          className={`w-24 h-24 rounded-full flex items-center justify-center text-4xl shadow-md transition-all ${
            isListening ? 'bg-red-500 text-white animate-pulse' : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
          }`}
        >
          🎤
        </button>
        <p className="mt-4 font-bold text-stone-700">
          {isListening 
            ? (lang === "en" ? "Listening..." : "Sedang Mendengar...") 
            : (lang === "en" ? "Tap to Start Reciting" : "Tekan untuk Mula Baca")}
        </p>
        {transcript && (
          <p className="mt-2 text-stone-500 italic text-sm text-center" dir="rtl">{transcript}</p>
        )}
      </div>

      {/* Ayah List */}
      <div className="space-y-4">
        {surahText.map((ayah, index) => {
          const isPassed = index < currentAyahIndex;
          const isCurrent = index === currentAyahIndex;
          
          let cardStyle = "bg-stone-50 border-stone-200 opacity-50"; // Future ayahs
          if (isPassed) cardStyle = "bg-white border-emerald-200 shadow-sm"; // Passed ayahs
          if (isCurrent) {
            if (status === "wrong") cardStyle = "bg-red-50 border-red-300 shadow-md ring-2 ring-red-200";
            else if (status === "correct") cardStyle = "bg-emerald-50 border-emerald-300 shadow-md ring-2 ring-emerald-200";
            else cardStyle = "bg-white border-emerald-500 shadow-md ring-2 ring-emerald-200";
          }

          return (
            <div key={ayah.ayah} className={`p-6 rounded-2xl border-2 transition-all duration-300 ${cardStyle}`}>
              <div className="flex justify-between items-center mb-2">
                <span className={`text-sm font-bold ${isCurrent ? 'text-emerald-700' : 'text-stone-400'}`}>
                  {lang === "en" ? "Ayah" : "Ayat"} {ayah.ayah}
                </span>
                
                {isCurrent && (
                  <div className="flex flex-wrap justify-end gap-2 max-w-[70%]">
                    {status === "wrong" && (
                      <button 
                        onClick={() => playAudio(ayah.globalAyah)}
                        className="text-xs font-bold bg-blue-100 text-blue-800 px-3 py-1 rounded-md hover:bg-blue-200"
                      >
                        🔊 {lang === "en" ? "Listen" : "Dengar"}
                      </button>
                    )}
                    {status === "wrong" && !clueRequested && !analysisRequested && (
                      <button 
                        onClick={() => setClueRequested(true)}
                        className="text-xs font-bold bg-red-100 text-red-700 px-3 py-1 rounded-md hover:bg-red-200"
                      >
                        {lang === "en" ? "Get Clue" : "Perlu Klu"}
                      </button>
                    )}
                    {status === "wrong" && !analysisRequested && (
                      <button 
                        onClick={() => setAnalysisRequested(true)}
                        className="text-xs font-bold bg-amber-100 text-amber-800 px-3 py-1 rounded-md hover:bg-amber-200"
                      >
                        {lang === "en" ? "Analyze" : "Analisis"}
                      </button>
                    )}
                    {/* Manual Override Button */}
                    <button 
                      onClick={markCorrect}
                      className="text-xs font-bold bg-emerald-100 text-emerald-800 px-3 py-1 rounded-md hover:bg-emerald-200"
                    >
                      {lang === "en" ? "Manual Pass" : "Lulus Manual"}
                    </button>
                  </div>
                )}
              </div>

              {isPassed ? (
                // Show fully passed text
                <p dir="rtl" className="text-3xl leading-loose text-stone-900 text-right mt-4" style={{ fontFamily: "'Amiri', 'Traditional Arabic', serif" }}>
                  {ayah.text}
                </p>
              ) : isCurrent ? (
                // Current Ayah logic
                <div className="mt-4">
                  {status === "wrong" && analysisRequested ? (
                    <div dir="rtl" className="text-3xl leading-loose text-right" style={{ fontFamily: "'Amiri', 'Traditional Arabic', serif" }}>
                      {ayah.text.split(" ").map((word, wIdx) => {
                        const normWord = normalizeArabic(word);
                        const wasSaid = spokenWordsState.some(w => w.includes(normWord) || normWord.includes(w) && w.length > 2);
                        return (
                          <span key={wIdx} className={`mr-2 ${wasSaid ? 'text-emerald-600' : 'text-red-500 underline decoration-red-300'}`}>
                            {word}
                          </span>
                        );
                      })}
                    </div>
                  ) : status === "wrong" && clueRequested ? (
                    <p dir="rtl" className="text-3xl leading-loose text-red-900 text-right opacity-70" style={{ fontFamily: "'Amiri', 'Traditional Arabic', serif" }}>
                      {/* Show just the first 2 words as a clue */}
                      {ayah.text.split(" ").slice(0, 2).join(" ")} ...
                    </p>
                  ) : (
                    <div className="h-12 flex items-center justify-center">
                      <p className={`font-bold text-xl ${status === "wrong" ? 'text-red-500' : 'text-stone-300'}`}>
                        {status === "wrong" 
                          ? (lang === "en" ? "Incorrect, try again!" : "Salah, cuba lagi!") 
                          : "???"}
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                // Future Ayahs hidden
                <div className="h-4 flex items-center justify-center">
                  <p className="text-stone-300">...</p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {currentAyahIndex >= surahText.length && (
        <div className="p-6 bg-emerald-100 rounded-3xl text-center border-2 border-emerald-200">
          <div className="text-5xl mb-3">🎉</div>
          <h3 className="text-2xl font-bold text-emerald-800">Alhamdulillah!</h3>
          <p className="text-emerald-700 mt-2">
            {lang === "en" ? "You have successfully recited this Surah." : "Anda berjaya mentasmik Surah ini."}
          </p>
        </div>
      )}
    </div>
  );
}

