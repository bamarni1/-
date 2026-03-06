/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Trophy, RotateCcw, ChevronRight, CheckCircle2, XCircle, Award, Users, Loader2, LogOut } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// Types
interface Player {
  id: string;
  name: string;
  score: number;
}

const SOUNDS = {
  correct: 'https://assets.mixkit.co/active_storage/sfx/2000/2000-preview.mp3',
  incorrect: 'https://assets.mixkit.co/active_storage/sfx/2959/2959-preview.mp3',
  buzz: 'https://assets.mixkit.co/active_storage/sfx/1073/1073-preview.mp3',
  tick: 'https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3',
  start: 'https://assets.mixkit.co/active_storage/sfx/1435/1435-preview.mp3',
  end: 'https://assets.mixkit.co/active_storage/sfx/2019/2019-preview.mp3',
};

const playSound = (type: keyof typeof SOUNDS) => {
  const audio = new Audio(SOUNDS[type]);
  audio.volume = 0.4;
  audio.play().catch(() => {
    // Silently fail if browser blocks autoplay
  });
};

interface Question {
  id: number;
  text: string;
  options: string[];
  correctAnswer: string;
  category: "world_cup" | "champions_league" | "la_liga" | "mixed" | "serie_a" | "bundesliga" | "iraqi_league" | "who_am_i" | "arab_cup" | "ligue_1";
}

interface RoomView {
  id: string;
  gameState: 'waiting' | 'playing' | 'finished';
  currentQuestionIndex: number;
  totalQuestions: number;
  timeLeft: number;
  buzzedPlayerId: string | null;
  isAnswered: boolean;
  players: Player[];
  question: Question;
}

interface LeaderboardEntry {
  name: string;
  score: number;
}

export default function App() {
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [playerName, setPlayerName] = useState('');
  const [room, setRoom] = useState<RoomView | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [roomCode, setRoomCode] = useState('');
  const [showFriendInput, setShowFriendInput] = useState(false);

  // Connect to WebSocket
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}`);
    
    ws.onopen = () => {
      console.log('Connected to server');
      setSocket(ws);
    };

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      console.log('Message from server:', message);

      switch (message.type) {
        case 'JOIN_SUCCESS':
          setPlayerId(message.playerId);
          setRoom(message.room);
          setLeaderboard(message.leaderboard || []);
          setIsConnecting(false);
          break;
        case 'PLAYER_JOINED':
        case 'PLAYER_LEFT':
          setRoom(prev => prev ? { ...prev, players: message.players } : null);
          break;
        case 'GAME_START':
          playSound('start');
          setRoom(message.room);
          setSelectedAnswer(null);
          break;
        case 'NEW_QUESTION':
          setRoom(message.room);
          setSelectedAnswer(null);
          break;
        case 'TIMER_TICK':
          if (message.timeLeft <= 5 && message.timeLeft > 0) {
            playSound('tick');
          }
          setRoom(prev => prev ? { ...prev, timeLeft: message.timeLeft } : null);
          break;
        case 'PLAYER_BUZZED':
          playSound('buzz');
          setRoom(prev => prev ? { ...prev, buzzedPlayerId: message.playerId } : null);
          break;
        case 'ANSWER_RESULT':
          if (message.isCorrect) {
            playSound('correct');
          } else {
            playSound('incorrect');
          }
          setRoom(prev => {
            if (!prev) return null;
            return { 
              ...prev, 
              isAnswered: true, 
              players: message.players,
              buzzedPlayerId: message.playerId // Who answered first
            };
          });
          setSelectedAnswer(message.selectedAnswer);
          break;
        case 'GAME_FINISHED':
          playSound('end');
          setLeaderboard(message.leaderboard || []);
          setRoom(prev => prev ? { ...prev, gameState: 'finished', players: message.players } : null);
          break;
        case 'ERROR':
          setError(message.message);
          setIsConnecting(false);
          break;
      }
    };

    ws.onclose = () => {
      console.log('Disconnected from server');
      setSocket(null);
    };

    return () => ws.close();
  }, []);

  const joinRoom = (isSinglePlayer: boolean = false, code?: string) => {
    if (!socket || !playerName) return;
    setIsConnecting(true);
    socket.send(JSON.stringify({ 
      type: 'JOIN_ROOM', 
      name: playerName, 
      isSinglePlayer,
      roomCode: code
    }));
  };

  const buzz = () => {
    if (!socket || !room || room.buzzedPlayerId || room.isAnswered) return;
    socket.send(JSON.stringify({ type: 'BUZZ' }));
  };

  const submitAnswer = (answer: string) => {
    if (!socket || !room || room.isAnswered) return;
    socket.send(JSON.stringify({ type: 'ANSWER', answer }));
  };

  const nextQuestion = () => {
    if (!socket || !room || !room.isAnswered) return;
    socket.send(JSON.stringify({ type: 'NEXT_QUESTION' }));
  };

  const getOptionStyle = (option: string) => {
    if (!room?.isAnswered) {
      return "bg-slate-800 hover:bg-slate-700 border-slate-600 text-white";
    }
    if (option === room.question.correctAnswer) return "bg-emerald-600 border-emerald-400 text-white font-bold";
    if (option === selectedAnswer) return "bg-rose-600 border-rose-400 text-white font-bold";
    return "bg-slate-800/50 border-slate-700 text-slate-400";
  };

  if (!room) {
    return (
      <div className="min-h-screen bg-[#0f172a] text-slate-100 font-sans flex items-center justify-center p-6" dir="rtl">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md space-y-8 text-center"
        >
          <div className="w-24 h-24 bg-emerald-500/20 rounded-3xl flex items-center justify-center border border-emerald-500/30 shadow-2xl shadow-emerald-500/20 mx-auto">
            <Trophy className="w-12 h-12 text-emerald-400" />
          </div>
          <div className="space-y-4">
            <h1 className="text-4xl font-bold tracking-tight text-white">هەڤرکیا تەپاپێ ٣٠ چرکە</h1>
            <p className="text-slate-400">پێزانینێت خو دگەل یاریکەران تاقی بکه بشێوێ راستەو خو</p>
          </div>

          <div className="space-y-4 bg-slate-800/50 p-8 rounded-3xl border border-slate-700">
            <div className="space-y-2 text-right">
              <label className="text-xs font-bold text-emerald-400 uppercase tracking-wider">ناڤێ تە</label>
              <input 
                type="text" 
                placeholder="ناڤێ خۆ بنڤیسە..."
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                className="w-full p-4 bg-slate-900 border-2 border-slate-700 rounded-2xl focus:border-emerald-500 outline-none transition-all text-white"
              />
            </div>

            {error && <p className="text-rose-500 text-sm font-medium">{error}</p>}
            <button 
              onClick={() => joinRoom(false)}
              disabled={isConnecting || !playerName}
              className="w-full py-4 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed text-[#0f172a] font-bold rounded-2xl transition-all active:scale-95 flex items-center justify-center gap-2"
            >
              {isConnecting && !showFriendInput ? <Loader2 className="w-5 h-5 animate-spin" /> : 'دەستپێبکە (Online)'}
            </button>

            {!showFriendInput ? (
              <button 
                onClick={() => setShowFriendInput(true)}
                disabled={isConnecting || !playerName}
                className="w-full py-4 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-2xl transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                <Users className="w-5 h-5" />
                دگەل هەڤالەکێ یاریێ بکە
              </button>
            ) : (
              <div className="space-y-3 p-4 bg-slate-900/50 rounded-2xl border border-slate-700 animate-in fade-in slide-in-from-top-2">
                <input 
                  type="text" 
                  placeholder="کۆدی ژوورێ بنڤیسە..."
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                  className="w-full p-3 bg-slate-800 border-2 border-slate-700 rounded-xl focus:border-emerald-500 outline-none transition-all text-white text-center font-mono tracking-widest"
                />
                <div className="flex gap-2">
                  <button 
                    onClick={() => joinRoom(false, roomCode)}
                    disabled={isConnecting || !roomCode}
                    className="flex-1 py-3 bg-emerald-500 hover:bg-emerald-400 text-[#0f172a] font-bold rounded-xl transition-all active:scale-95"
                  >
                    {isConnecting ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'بچە د ژوورێ دا'}
                  </button>
                  <button 
                    onClick={() => setShowFriendInput(false)}
                    className="px-4 py-3 bg-slate-700 hover:bg-slate-600 text-white font-bold rounded-xl transition-all"
                  >
                    پاشکەفتن
                  </button>
                </div>
                <p className="text-[10px] text-slate-500 text-center">کۆدەکێ بنڤیسە و بۆ هەڤالێ خۆ بفرێژە دا پێکڤە یاریێ بکەن</p>
              </div>
            )}
            <button 
              onClick={() => setShowLeaderboard(true)}
              className="w-full py-4 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-2xl transition-all active:scale-95 flex items-center justify-center gap-2 border border-slate-700 relative overflow-hidden group"
            >
              <Award className="w-5 h-5" />
              باشترین یاریکەرێن یاریێ
              {leaderboard.length > 0 && (
                <div className="absolute left-0 top-0 bottom-0 bg-emerald-500/10 px-3 flex items-center border-r border-slate-700 group-hover:bg-emerald-500/20 transition-colors">
                  <span className="text-[10px] font-mono font-bold text-emerald-400">{leaderboard[0].score}</span>
                </div>
              )}
            </button>
          </div>

          {/* Game Rules Section */}
          <div className="bg-slate-800/30 p-6 rounded-3xl border border-slate-700/50 text-right space-y-3">
            <h3 className="text-emerald-400 font-bold flex items-center justify-end gap-2">
              یاسایێن یاریێ
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            </h3>
            <ul className="space-y-2 text-sm text-slate-300">
              <li className="flex items-start justify-end gap-2">
                <span>بلەزترین یاریکەر دێ خالێ بەت.</span>
                <span className="text-emerald-500 font-bold">١.</span>
              </li>
              <li className="flex items-start justify-end gap-2">
                <span>هەر دەمێ ئێک ژ یاریکەران بەرسڤ دا، یێ دی نەشێت بەرسڤێ بدەت.</span>
                <span className="text-emerald-500 font-bold">٢.</span>
              </li>
              <li className="flex items-start justify-end gap-2">
                <span>ئەگەر بەرسڤا تە خەلەت بیت، خال دێ چیتە بۆ هەڤرکی تە.</span>
                <span className="text-emerald-500 font-bold">٣.</span>
              </li>
            </ul>
          </div>

          <AnimatePresence>
            {showLeaderboard && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-6"
              >
                <motion.div 
                  initial={{ scale: 0.9, y: 20 }}
                  animate={{ scale: 1, y: 0 }}
                  className="bg-slate-800 w-full max-w-md rounded-3xl border border-slate-700 overflow-hidden"
                >
                  <div className="p-6 border-b border-slate-700 flex items-center justify-between">
                    <h2 className="text-xl font-bold text-white">باشترین یاریکەرێن یاریێ</h2>
                    <button onClick={() => setShowLeaderboard(false)} className="text-slate-400 hover:text-white">
                      <XCircle className="w-6 h-6" />
                    </button>
                  </div>
                  <div className="p-6 space-y-4">
                    {leaderboard.length > 0 ? (
                      leaderboard.map((entry, idx) => (
                        <div key={idx} className="flex items-center justify-between p-4 bg-slate-900/50 rounded-2xl border border-slate-700">
                          <div className="flex items-center gap-4">
                            <span className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${idx === 0 ? 'bg-amber-500 text-white' : idx === 1 ? 'bg-slate-300 text-slate-900' : idx === 2 ? 'bg-amber-700 text-white' : 'bg-slate-800 text-slate-400'}`}>
                              {idx + 1}
                            </span>
                            <span className="font-bold text-white">{entry.name}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-emerald-400">{entry.score}</span>
                            <span className="text-[10px] text-slate-500 uppercase font-bold">خال</span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-center text-slate-500 py-8">هێشتا چ سەرکەفتی نینن...</p>
                    )}
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    );
  }

  if (room.gameState === 'waiting') {
    return (
      <div className="min-h-screen bg-[#0f172a] text-slate-100 font-sans flex items-center justify-center p-6" dir="rtl">
        <div className="text-center space-y-6">
          <div className="relative">
            <div className="w-20 h-20 bg-blue-500/20 rounded-full flex items-center justify-center border border-blue-500/30 mx-auto animate-pulse">
              <Users className="w-10 h-10 text-blue-400" />
            </div>
          </div>
          <div className="space-y-1">
            <h2 className="text-xl font-bold text-white">ل هیڤیا هەڤالەکێ بە...</h2>
            <p className="text-slate-400 italic text-sm">سیستەم دێ یاریزانەکێ دی بۆ تە پەیدا کەت</p>
          </div>
          <div className="flex flex-col items-center gap-3">
            <div className="flex items-center gap-2 bg-slate-800 px-3 py-1.5 rounded-full border border-slate-700">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-ping" />
              <span className="text-xs font-medium">{room.players[0].name} یێ ل ژوورێ</span>
            </div>
            <button 
              onClick={() => window.location.reload()}
              className="text-slate-500 hover:text-white transition-colors flex items-center gap-2 text-sm"
            >
              <LogOut className="w-4 h-4" />
              دەرکەفتن
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (room.gameState === 'finished') {
    const winner = [...room.players].sort((a, b) => b.score - a.score)[0];
    const isWinner = winner.id === playerId;

    return (
      <div className="min-h-screen bg-[#0f172a] text-slate-100 font-sans flex items-center justify-center p-6" dir="rtl">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md text-center space-y-6"
        >
          <div className="relative mx-auto w-24 h-24">
            <div className={`w-full h-full rounded-full flex items-center justify-center border-4 ${isWinner ? 'bg-amber-500/20 border-amber-500/30' : 'bg-slate-800/20 border-slate-700/30'}`}>
              <Award className={`w-12 h-12 ${isWinner ? 'text-amber-400' : 'text-slate-500'}`} />
            </div>
          </div>

          <div className="space-y-1">
            <h2 className="text-2xl font-bold text-white">یاری ب دوماهی هات!</h2>
            <p className="text-xl font-bold text-emerald-400">
              {room.players.length > 1 
                ? (room.players[0].score === room.players[1].score ? "یەکسان بوون!" : `🏆 ${winner.name} سەرکەفت!`)
                : `تە ${winner.score} خال کۆمکرن!`}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {room.players.map(p => (
              <div key={p.id} className={`p-4 rounded-2xl border-2 ${p.id === playerId ? 'bg-slate-800 border-slate-600' : 'bg-slate-900/50 border-slate-800'}`}>
                <p className="text-[10px] font-bold text-slate-500 uppercase mb-0.5">{p.name}</p>
                <p className="text-2xl font-mono font-bold text-white">{p.score}</p>
              </div>
            ))}
          </div>

          <button 
            onClick={() => window.location.reload()}
            className="w-full py-3.5 bg-emerald-500 hover:bg-emerald-400 text-[#0f172a] font-bold rounded-xl flex items-center justify-center gap-2 transition-all active:scale-95"
          >
            <RotateCcw className="w-5 h-5" />
            دوبارە یاریێ بکە
          </button>
        </motion.div>
      </div>
    );
  }

  const myPlayer = room.players.find(p => p.id === playerId);
  const opponent = room.players.find(p => p.id !== playerId);
  const isMyTurn = room.buzzedPlayerId === playerId;

  return (
    <div className="min-h-screen bg-[#0f172a] text-slate-100 font-sans selection:bg-emerald-500/30" dir="rtl">
      <main className="max-w-lg mx-auto px-4 py-4 min-h-screen flex flex-col">
        {/* Multiplayer Header */}
        <div className="flex items-center justify-between mb-4">
          <div className={`flex flex-col items-center p-2 rounded-xl border-2 transition-all ${room.buzzedPlayerId === myPlayer?.id ? 'bg-emerald-500/20 border-emerald-500 scale-105' : 'bg-slate-800/50 border-slate-700'}`}>
            <span className="text-[10px] font-bold text-slate-400 mb-0.5">{myPlayer?.name} (تۆ)</span>
            <span className="text-lg font-mono font-bold text-emerald-400">{myPlayer?.score}</span>
          </div>

          <div className="relative flex items-center justify-center">
            <svg className="w-14 h-14 transform -rotate-90">
              <circle cx="28" cy="28" r="24" stroke="currentColor" strokeWidth="3" fill="transparent" className="text-slate-800" />
              <motion.circle
                cx="28"
                cy="28"
                r="24"
                stroke="currentColor"
                strokeWidth="3"
                fill="transparent"
                strokeDasharray="150.8"
                animate={{ strokeDashoffset: 150.8 * (1 - room.timeLeft / 30) }}
                className={`${room.timeLeft <= 10 ? 'text-rose-500' : 'text-emerald-500'}`}
              />
            </svg>
            <span className={`absolute font-mono text-lg font-bold ${room.timeLeft <= 10 ? 'text-rose-500 animate-pulse' : 'text-white'}`}>
              {room.timeLeft}
            </span>
          </div>

          {opponent ? (
            <div className={`flex flex-col items-center p-2 rounded-xl border-2 transition-all ${room.buzzedPlayerId === opponent?.id ? 'bg-blue-500/20 border-blue-500 scale-105' : 'bg-slate-800/50 border-slate-700'}`}>
              <span className="text-[10px] font-bold text-slate-400 mb-0.5">{opponent?.name}</span>
              <span className="text-lg font-mono font-bold text-blue-400">{opponent?.score}</span>
            </div>
          ) : (
            <div className="w-14" />
          )}
        </div>

        {/* Game Phase */}
        <div className="flex-1 flex flex-col">
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex-1 flex flex-col"
          >
            <div className="text-center mb-3">
              <div className="flex justify-center gap-1 mb-2">
                {Array.from({ length: room.totalQuestions }).map((_, i) => (
                  <div 
                    key={i} 
                    className={`h-1 rounded-full transition-all duration-500 ${
                      i < room.currentQuestionIndex ? 'bg-emerald-500 w-6' : 
                      i === room.currentQuestionIndex ? 'bg-amber-500 w-8 animate-pulse' : 
                      'bg-slate-700 w-3'
                    }`}
                  />
                ))}
              </div>
              <p className="text-[9px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-1">
                پرسیارا {room.currentQuestionIndex + 1} ژ {room.totalQuestions}
              </p>
              {room.isAnswered ? (
                <span className={`inline-block px-3 py-1 rounded-full text-[9px] font-bold uppercase tracking-widest mb-2 ${room.buzzedPlayerId === playerId ? 'bg-emerald-500 text-[#0f172a]' : 'bg-blue-500 text-white'}`}>
                  {room.buzzedPlayerId === playerId ? 'تە بەرسڤ دا!' : `${opponent?.name} بەرسڤ دا...`}
                </span>
              ) : (
                <span className="inline-block px-3 py-1 rounded-full text-[9px] font-bold uppercase tracking-widest mb-2 bg-amber-500 text-[#0f172a] animate-pulse">
                  زوی بەرسڤێ بدە!
                </span>
              )}
              <h2 className="text-lg font-bold text-white leading-tight px-2">
                {room.question.text}
              </h2>
            </div>

            <div className="grid gap-2 mb-4">
              {room.question.options.map((option, idx) => (
                <button
                  key={idx}
                  onClick={() => submitAnswer(option)}
                  disabled={room.isAnswered}
                  className={`
                    w-full p-3 rounded-xl border-2 text-right transition-all duration-300 flex items-center justify-between
                    ${getOptionStyle(option)}
                  `}
                >
                  <span className="text-sm font-medium">{option}</span>
                  {room.isAnswered && option === room.question.correctAnswer && <CheckCircle2 className="w-4 h-4 text-white" />}
                  {room.isAnswered && option === selectedAnswer && option !== room.question.correctAnswer && <XCircle className="w-4 h-4 text-white" />}
                </button>
              ))}
            </div>

            <div className="mt-auto pt-2 h-16 flex items-center justify-center">
              {room.isAnswered && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="text-slate-400 font-medium flex items-center gap-2 bg-slate-800/30 px-6 py-3 rounded-2xl border border-slate-700/50"
                >
                  <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
                  <span>پرسیارا بهێت دێ هێت...</span>
                </motion.div>
              )}
            </div>
          </motion.div>
        </div>
      </main>

    </div>
  );
}
