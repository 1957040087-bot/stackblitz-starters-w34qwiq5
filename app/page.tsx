'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import {
  Mic, Send, Camera, Home as HomeIcon, PieChart, Plus,
  X, Save, Sparkles,
  CalendarDays as CalendarIcon, LogOut, Settings, Search, Scroll, AlertCircle
} from 'lucide-react';
import { Transaction, User } from '@/lib/types';
import { mockLocalStorage } from '@/lib/storage';
import { callGeminiAPI } from '@/lib/gemini';
import { fileToGenerativePart, formatDate } from '@/lib/utils';
import { USE_CLOUD_STORAGE } from '@/lib/constants';
import GlobalStyles from '@/components/GlobalStyles';
import WelcomeScreen from '@/components/WelcomeScreen';
import TransactionList from '@/components/TransactionList';
import DonutChart from '@/components/DonutChart';
import MonthlyBarChart from '@/components/MonthlyBarChart';

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [hasJoined, setHasJoined] = useState(false);
  const [activeTab, setActiveTab] = useState('home');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [inputText, setInputText] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [detectedData, setDetectedData] = useState<Partial<Transaction>[]>([]);
  const [errorMsg, setErrorMsg] = useState('');
  const [isRecording, setIsRecording] = useState(false);

  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    const savedUser = localStorage.getItem('vintage_user');
    if (!USE_CLOUD_STORAGE && savedUser) {
      setUser(JSON.parse(savedUser));
      setHasJoined(true);
    }
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined' && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.lang = 'vi-VN';
      recognitionRef.current.interimResults = false;

      recognitionRef.current.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setInputText(transcript);
        handleAI('text', transcript);
        setIsRecording(false);
      };

      recognitionRef.current.onerror = () => setIsRecording(false);
      recognitionRef.current.onend = () => setIsRecording(false);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    const localTrans = mockLocalStorage.get<Transaction>(`trans_${user.uid}`);
    setTransactions(localTrans.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
  }, [user, activeTab]);

  const handleStart = (name: string) => {
    const safeNameId = name.trim().toLowerCase().replace(/\s+/g, '_');
    const newUser = { uid: 'local_' + safeNameId, displayName: name };
    localStorage.setItem('vintage_user', JSON.stringify(newUser));
    setUser(newUser);
    setHasJoined(true);
  };

  const handleLogout = () => {
    localStorage.removeItem('vintage_user');
    setUser(null);
    setHasJoined(false);
  };

  const toggleRecord = () => {
    if (!recognitionRef.current) {
      alert("Trình duyệt của bạn không hỗ trợ giọng nói.");
      return;
    }
    if (isRecording) {
      recognitionRef.current.stop();
    } else {
      setIsRecording(true);
      recognitionRef.current.start();
    }
  };

  const handleAI = async (type: 'text' | 'image', payload: any) => {
    setAnalyzing(true);
    setErrorMsg('');
    try {
      let results: Partial<Transaction>[] = [];
      if (type === 'image') {
        const imgPart = await fileToGenerativePart(payload);
        results = await callGeminiAPI(imgPart, 'image');
      } else {
        results = await callGeminiAPI(payload, 'text');
      }

      const normalized = (Array.isArray(results) ? results : [results]).map(i => {
        let validDate = new Date().toISOString();
        if (i.date) {
          const parsed = new Date(i.date);
          if (!isNaN(parsed.getTime())) validDate = parsed.toISOString();
        }
        return {
          ...i,
          date: validDate,
          amount: Number(i.amount) || 0,
          type: (i.type === 'income' ? 'income' : 'expense') as 'income' | 'expense',
          category: i.category || 'Khác',
          note: i.note || 'Ghi chép mới'
        };
      });

      if (normalized.length === 0) throw new Error("Không tìm thấy thông tin tài chính nào!");
      setDetectedData(normalized);
    } catch (e: any) {
      console.error(e);
      setErrorMsg("AI Lỗi: " + e.message);
      setTimeout(() => setErrorMsg(''), 8000);
    } finally {
      setAnalyzing(false);
    }
  };

  const removeDetectedItem = (index: number) => {
    const newData = [...detectedData];
    newData.splice(index, 1);
    setDetectedData(newData);
  };

  const saveTransactions = () => {
    if (!user) return;
    const itemsToSave = detectedData.filter(t => (t.amount || 0) > 0);
    itemsToSave.forEach(item => {
      mockLocalStorage.add(`trans_${user.uid}`, item as Transaction);
    });
    const updatedData = mockLocalStorage.get<Transaction>(`trans_${user.uid}`);
    setTransactions(updatedData.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
    setDetectedData([]);
    setInputText('');
    setActiveTab('home');
  };

  const monthlyData = useMemo(() => {
    const groups: { [key: string]: { month: string; income: number; expense: number } } = {};
    transactions.forEach(t => {
      const date = new Date(t.date);
      if (isNaN(date.getTime())) return;
      const key = `${date.getMonth() + 1}/${date.getFullYear()}`;
      if (!groups[key]) groups[key] = { month: key, income: 0, expense: 0 };
      if (t.type === 'income') groups[key].income += t.amount;
      else groups[key].expense += t.amount;
    });
    return Object.values(groups).sort((a, b) => {
      const [m1, y1] = a.month.split('/').map(Number);
      const [m2, y2] = b.month.split('/').map(Number);
      return (y1 * 12 + m1) - (y2 * 12 + m2);
    });
  }, [transactions]);

  if (!hasJoined) return <WelcomeScreen onStart={handleStart} />;

  const renderHome = () => {
    const totalIncome = transactions.filter(t => t.type === 'income').reduce((acc, t) => acc + t.amount, 0);
    const totalExpense = transactions.filter(t => t.type === 'expense').reduce((acc, t) => acc + t.amount, 0);

    return (
      <div className="pb-32 animate-fade-in">
        <div className="p-6 pb-4 relative z-10 text-center flex justify-between items-center">
          <button className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-[#DAA520] rounded-full hover:bg-[#FDFBF7]">
            <Settings size={18}/>
          </button>
          <h2 className="text-3xl font-heading font-bold text-[#4A403A] tracking-wide relative inline-block">
            <span className="text-4xl text-[#DAA520]">✦</span> Tổng Quan <span className="text-4xl text-[#DAA520]">✦</span>
          </h2>
          <button onClick={handleLogout} className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-red-500 rounded-full hover:bg-[#FDFBF7]">
            <LogOut size={18} />
          </button>
        </div>

        <div className="mx-6 p-6 paper-texture rounded-xl vintage-shadow border border-[#DAA520] relative text-center mb-6">
          <p className="text-gray-500 text-sm font-body uppercase tracking-widest mb-2">Ngân Khố</p>
          <h1 className="text-4xl font-heading font-bold text-[#4A403A] mb-1">
            {(totalIncome - totalExpense).toLocaleString()}
          </h1>
          <p className="text-sm text-[#DAA520] font-heading font-bold">Đồng</p>
        </div>

        <div className="px-6">
          <div className="flex items-center gap-2 mb-4 opacity-70">
            <div className="h-[1px] bg-[#4A403A] flex-1"></div>
            <span className="font-heading text-sm font-bold">Ghi Chép Gần Đây</span>
            <div className="h-[1px] bg-[#4A403A] flex-1"></div>
          </div>
          <TransactionList transactions={transactions.slice(0, 5)} />
        </div>
      </div>
    );
  };

  const renderHistory = () => (
    <div className="pb-32 animate-fade-in px-6">
      <div className="p-6 pb-2 text-center">
        <h2 className="text-3xl font-heading font-bold text-[#4A403A]">
          <span className="text-[#DAA520]">✦</span> Sổ Cái <span className="text-4xl text-[#DAA520]">✦</span>
        </h2>
        <p className="text-gray-500 text-sm italic">Lịch sử thu chi</p>
      </div>

      <div className="bg-[#FDFBF7] p-4 rounded-xl vintage-shadow border border-[#E6E2D6] min-h-[50vh]">
        <div className="flex items-center gap-2 mb-4">
          <Search size={16} className="text-gray-400"/>
          <input placeholder="Tìm kiếm giao dịch..." className="bg-transparent border-b border-gray-200 text-sm w-full focus:outline-none font-body"/>
        </div>
        {transactions.length === 0 ? (
          <p className="text-center text-gray-400 italic mt-10">Sổ cái còn trống...</p>
        ) : (
          <div className="overflow-y-auto max-h-[60vh]">
            <TransactionList transactions={transactions} />
          </div>
        )}
      </div>
    </div>
  );

  const renderAdd = () => (
    <div className="h-screen flex flex-col bg-[#FDFBF7]">
      <div className="p-6 text-center">
        <h2 className="text-2xl font-heading text-[#4A403A]">Ghi Chép Mới</h2>
        <p className="text-gray-400 italic text-sm">&quot;20tr tiền lương&quot;, &quot;Cafe 30k&quot;...</p>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-6 space-y-6 overflow-hidden">
        {analyzing ? (
          <div className="text-center animate-pulse">
            <Sparkles className="text-[#DAA520] animate-spin w-12 h-12 mx-auto mb-2" />
            <p className="font-heading text-[#4A403A]">Đang luận giải...</p>
          </div>
        ) : detectedData.length > 0 ? (
          <div className="w-full max-w-md bg-white p-4 rounded-xl vintage-shadow border border-[#E6E2D6] max-h-[60vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4 border-b border-dashed border-gray-300 pb-2">
              <h3 className="font-heading font-bold">Xác Nhận ({detectedData.length})</h3>
              <button onClick={() => setDetectedData([])}><X size={20} className="text-gray-400 hover:text-red-500"/></button>
            </div>
            {detectedData.map((item, idx) => (
              <div key={idx} className="mb-4 bg-[#F9F7F2] p-3 rounded border border-gray-100 flex flex-col gap-2 relative group">
                <button
                  onClick={() => removeDetectedItem(idx)}
                  className="absolute -top-2 -right-2 bg-white text-red-400 p-1 rounded-full shadow border border-gray-200 hover:bg-red-50 z-10"
                >
                  <X size={14} />
                </button>
                <div className="flex gap-2">
                  <input
                    className="font-heading font-bold text-[#8FBC8F] bg-transparent border-b border-gray-300 focus:outline-none w-1/2 text-sm"
                    value={item.category}
                    onChange={(e) => {
                      const newData = [...detectedData];
                      newData[idx].category = e.target.value;
                      setDetectedData(newData);
                    }}
                  />
                  <div className="flex items-center gap-1 w-1/2 justify-end">
                    <input
                      type="number"
                      className="font-body font-bold bg-transparent border-b border-gray-300 focus:outline-none text-right w-full"
                      value={item.amount}
                      onChange={(e) => {
                        const newData = [...detectedData];
                        newData[idx].amount = Number(e.target.value);
                        setDetectedData(newData);
                      }}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <CalendarIcon size={14} className="text-[#DAA520]" />
                  <input
                    type="date"
                    className="bg-transparent border-b border-gray-200 focus:outline-none text-xs w-full"
                    value={formatDate(item.date || '')}
                    onChange={(e) => {
                      const newData = [...detectedData];
                      newData[idx].date = new Date(e.target.value).toISOString();
                      setDetectedData(newData);
                    }}
                  />
                </div>
                <input
                  className="text-sm italic text-gray-500 bg-transparent border-b border-gray-200 focus:outline-none w-full"
                  value={item.note}
                  onChange={(e) => {
                    const newData = [...detectedData];
                    newData[idx].note = e.target.value;
                    setDetectedData(newData);
                  }}
                />
              </div>
            ))}
            <button onClick={saveTransactions} className="w-full bg-[#8FBC8F] text-white font-heading font-bold py-3 rounded-lg mt-2 shadow flex items-center justify-center gap-2">
              <Save size={18}/> Ghi Vào Sổ
            </button>
          </div>
        ) : (
          <div className="text-center opacity-40">
            {errorMsg && (
              <div className="mb-4 bg-red-100 text-red-600 p-2 rounded text-sm flex items-center gap-2 justify-center">
                <AlertCircle size={16}/> {errorMsg}
              </div>
            )}
            <Scroll size={48} className="mx-auto mb-2 text-[#DAA520]" />
            <p className="font-body italic">Chưa có nội dung...</p>
          </div>
        )}
      </div>

      <div className="p-4 pb-32 bg-[#E6E2D6] rounded-t-3xl shadow-lg">
        <div className="flex items-center gap-2 bg-[#FDFBF7] p-2 rounded-full border border-[#D1CCBF]">
          <label className="p-3 text-[#4A403A] hover:text-[#DAA520] cursor-pointer transition-colors border-r border-[#E6E2D6]">
            <input type="file" accept="image/*" className="hidden" onChange={(e) => {
              const file = e.target.files?.[0];
              if(file) {
                handleAI('image', file);
                e.target.value = '';
              }
            }} />
            <Camera size={20} />
          </label>
          <input
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAI('text', inputText)}
            placeholder="Nhập hoặc bấm Micro để nói..."
            className="flex-1 bg-transparent border-none focus:ring-0 text-[#4A403A] font-body"
          />
          {inputText.trim() ? (
            <button onClick={() => handleAI('text', inputText)} className="p-3 bg-[#DAA520] text-white rounded-full">
              <Send size={18} />
            </button>
          ) : (
            <button onClick={toggleRecord} className={`p-3 rounded-full ${isRecording ? 'bg-red-500 animate-pulse text-white' : 'bg-[#DAA520] text-white'}`}>
              <Mic size={18} />
            </button>
          )}
        </div>
      </div>
    </div>
  );

  const renderReport = () => {
    const data = transactions.filter(t => t.type === 'expense').reduce((acc: any[], curr) => {
      const exist = acc.find(i => i.name === curr.category);
      if (exist) exist.value += curr.amount;
      else acc.push({ name: curr.category, value: curr.amount });
      return acc;
    }, []);
    const colors = ['#8FBC8F', '#D8BFD8', '#E0A96D', '#ADD8E6', '#F08080', '#DAA520'];

    return (
      <div className="pb-32 animate-fade-in px-6">
        <div className="p-6 pb-2 text-center">
          <h2 className="text-3xl font-heading font-bold text-[#4A403A]">
            <span className="text-[#DAA520]">✦</span> Tổng Kết <span className="text-4xl text-[#DAA520]">✦</span>
          </h2>
          <p className="text-gray-500 text-sm italic">Góc nhìn toàn cảnh</p>
        </div>

        <div className="bg-[#FDFBF7] rounded-xl p-6 border border-[#E6E2D6] vintage-shadow mb-6 text-center">
          <h3 className="font-heading text-lg font-bold mb-4 text-[#4A403A] flex items-center justify-center gap-2">
            <PieChart size={18}/> Phân Tích Danh Mục
          </h3>
          <DonutChart data={data} colors={colors} />
        </div>

        <div className="bg-white rounded-xl p-4 border border-[#E6E2D6] vintage-shadow mb-6">
          <h3 className="font-heading text-lg font-bold text-[#4A403A] flex items-center gap-2">
            Xu Hướng Tháng
          </h3>
          <MonthlyBarChart monthlyData={monthlyData} />
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-md mx-auto min-h-screen relative shadow-2xl overflow-hidden" style={{backgroundColor: '#E6E2D6'}}>
      <GlobalStyles />
      <div className="h-full">
        {activeTab === 'home' && renderHome()}
        {activeTab === 'add' && renderAdd()}
        {activeTab === 'report' && renderReport()}
        {activeTab === 'history' && renderHistory()}
      </div>

      <div className="fixed bottom-6 left-6 right-6 max-w-xs mx-auto z-50 flex items-center justify-center">
        <div className="absolute inset-0 paper-texture rounded-full vintage-shadow border border-[#E6E2D6]"></div>
        <div className="relative flex justify-between w-full px-4 py-3 items-center">
          <div className="flex gap-6 pl-2">
            <button onClick={() => setActiveTab('home')} className={`transition-colors flex flex-col items-center ${activeTab === 'home' ? 'text-[#8FBC8F]' : 'text-gray-400'}`}><HomeIcon size={22} /></button>
            <button onClick={() => setActiveTab('history')} className={`transition-colors flex flex-col items-center ${activeTab === 'history' ? 'text-[#4A403A]' : 'text-gray-400'}`}><Scroll size={22} /></button>
          </div>
          <div className="w-12"></div>
          <div className="flex gap-6 pr-2">
            <button onClick={() => setActiveTab('report')} className={`transition-colors flex flex-col items-center ${activeTab === 'report' ? 'text-[#D8BFD8]' : 'text-gray-400'}`}><PieChart size={22} /></button>
            <button onClick={() => setActiveTab('add')} className={`transition-colors flex flex-col items-center ${activeTab === 'add' ? 'text-[#DAA520]' : 'text-gray-400'}`}><CalendarIcon size={22} /></button>
          </div>
        </div>
        <button onClick={() => setActiveTab('add')} className="absolute bottom-6 bg-[#DAA520] text-white w-14 h-14 rounded-full flex items-center justify-center shadow-lg border-4 border-[#E6E2D6] transition-transform hover:scale-110 z-20"><Plus size={28} /></button>
      </div>
    </div>
  );
}
