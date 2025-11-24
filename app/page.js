'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Mic, Send, Camera, Home, PieChart, Plus, 
  Trash2, TrendingUp, TrendingDown, X, 
  Activity, Save, Feather, BookOpen, Sparkles, 
  CalendarDays as CalendarIcon,
  Clock, Shield, Target, Coins, Scroll, Bell, ChevronLeft, ChevronRight, AlertCircle, Search, LogOut, User, Lock, Mail, Edit3, Settings, Key, Filter,
  MessageSquareQuote
} from 'lucide-react';

// --- IMPORT FIREBASE ---
import { initializeApp } from "firebase/app";
import { 
  getAuth, signInWithCustomToken, signInAnonymously, 
  signOut, onAuthStateChanged, updateProfile 
} from "firebase/auth";
import { 
  getFirestore, collection, addDoc, deleteDoc, updateDoc, doc, 
  onSnapshot, query, orderBy, serverTimestamp 
} from "firebase/firestore";

// ==========================================
// CẤU HÌNH ỨNG DỤNG
// ==========================================

const appId = "vintage_ledger_v1";
const apiKey = "AIzaSyAYqFmD40oqF4B_5B7IQPnFWoVXF5jYFpI"; 
const USE_CLOUD_STORAGE = false; 

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// --- KHỞI TẠO DỊCH VỤ ---
let app, auth, db;
if (USE_CLOUD_STORAGE) {
  try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
  } catch (e) {
    console.error("Lỗi khởi tạo Firebase. Đang chuyển sang chế độ Offline.", e);
  }
}

// --- MOCK SERVICES (Safe for SSR) ---
const generateUniqueId = () => {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
};

// Helper để truy cập localStorage an toàn (tránh lỗi khi render trên server)
const safeLocalStorage = {
  getItem: (key) => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(key);
    }
    return null;
  },
  setItem: (key, value) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(key, value);
    }
  },
  removeItem: (key) => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(key);
    }
  }
};

const mockLocalStorage = {
  get: (key) => {
    try {
      const data = JSON.parse(safeLocalStorage.getItem(key) || '[]');
      const seenIds = new Set();
      return data.map(item => {
        if (seenIds.has(item.id)) {
          item.id = generateUniqueId();
        }
        seenIds.add(item.id);
        return item;
      });
    } catch (e) { return []; }
  },
  set: (key, data) => safeLocalStorage.setItem(key, JSON.stringify(data)),
  add: (key, item) => {
    const data = mockLocalStorage.get(key);
    const newItem = { ...item, id: generateUniqueId() };
    mockLocalStorage.set(key, [newItem, ...data]);
    return newItem;
  },
  update: (key, id, newItem) => {
    const data = mockLocalStorage.get(key);
    const index = data.findIndex(i => i.id === id);
    if (index !== -1) {
      data[index] = { ...data[index], ...newItem };
      mockLocalStorage.set(key, data);
    }
  },
  delete: (key, id) => {
    const data = mockLocalStorage.get(key);
    const newData = data.filter(i => i.id !== id);
    mockLocalStorage.set(key, newData);
  }
};

// --- CONSTANTS ---
const CATEGORY_LIST = [
  "Thực phẩm", "Di chuyển", "Nhà cửa", "Y phục", "Làm đẹp",
  "Giáo dục", "Giải trí", "Rèn luyện", "Sức khỏe",
  "Bổng lộc", "Đầu tư", "Tiền điện tử", "Chứng chỉ quỹ", 
  "Tiết kiệm ngân hàng", "Trả nợ", "Hóa đơn", "Khác"
];

// --- HELPER FUNCTIONS ---
const formatCurrency = (amount) => {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' })
    .format(amount).replace('₫', 'Đồng');
};

const formatDate = (isoString) => {
    if (!isoString) return '';
    try {
        return new Date(isoString).toLocaleDateString('vi-VN');
    } catch (e) { return isoString; }
};

const fileToGenerativePart = async (file) => {
  const base64EncodedDataPromise = new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(',')[1]);
    reader.readAsDataURL(file);
  });
  return { 
    inline_data: { 
      data: await base64EncodedDataPromise, 
      mime_type: file.type 
    } 
  };
};

// --- AI API FUNCTIONS ---
const callGeminiAPI = async (inputData, type = 'text') => {
  const userKey = safeLocalStorage.getItem('gemini_api_key');
  const activeKey = userKey ? userKey.trim() : apiKey;

  if (!activeKey || activeKey.length < 10) {
      await new Promise(r => setTimeout(r, 1500)); 
      return [{ 
          amount: 50000, 
          type: "expense", 
          category: "Khác", 
          note: "Demo Mode (Vui lòng nhập API Key để dùng thật)", 
          date: new Date().toISOString() 
      }];
  }

  let userContent;
  const now = new Date();
  const todayStr = now.toLocaleDateString('vi-VN');

  const systemPrompt = `
  Bạn là một trợ lý tài chính cá nhân người Việt. Nhiệm vụ của bạn là trích xuất thông tin từ văn bản hoặc hình ảnh hóa đơn.
  
  QUY TẮC XỬ LÝ QUAN TRỌNG:
  1. Xử lý Hóa đơn/Lịch sử mua hàng (Ví dụ Shopee, Tiki, List đơn hàng):
     - Nếu ảnh chứa danh sách nhiều đơn hàng, MỖI ĐƠN HÀNG là MỘT mục chi tiêu riêng biệt.
     - **CHỈ LẤY** số tiền ở dòng "Total", "Tổng thanh toán", "Thành tiền", "Total ... items" của từng đơn hàng.
     - **TUYỆT ĐỐI KHÔNG** lấy giá của từng món lẻ bên trong nếu đã có dòng Total của đơn hàng đó.
  
  2. Số tiền:
     - Chuyển đổi linh hoạt: "50k" -> 50000, "1tr2" -> 1200000, "5 lít" -> 500000.
  
  3. Phân loại (Category):
     - Chọn CHÍNH XÁC 1 mục trong danh sách: [${CATEGORY_LIST.join(', ')}].
     - Ví dụ: "cắt tóc" -> "Làm đẹp", "đổ xăng" -> "Di chuyển".

  4. Thời gian (Date) - QUAN TRỌNG:
     - Hôm nay là ngày: ${todayStr}.
     - Nếu nội dung có nhắc đến thời gian cụ thể (VD: "ngày 15/10") hoặc tương đối (VD: "hôm qua", "hôm kia"), hãy tính toán và trả về định dạng YYYY-MM-DD.
     - **NẾU KHÔNG ĐỀ CẬP THỜI GIAN**: Mặc định lấy ngày hôm nay (${now.toISOString().split('T')[0]}).
  
  5. OUTPUT:
     - Trả về MỘT MẢNG JSON thuần túy (không markdown, không giải thích).
     - Cấu trúc: [{ "amount": number, "type": "expense"|"income", "category": "string", "note": "string", "date": "YYYY-MM-DD" }]
  `;

  if (type === 'image') {
    userContent = [
        { text: systemPrompt + "\n\nPhân tích chi tiết hình ảnh hóa đơn này:" },
        inputData 
    ];
  } else {
    userContent = [
        { text: systemPrompt + `\n\nPhân tích văn bản: "${inputData}"` }
    ];
  }

  const payload = {
    contents: [{ role: "user", parts: userContent }],
    generationConfig: { responseMimeType: "application/json" }
  };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${activeKey}`;

  let attempt = 0;
  const maxRetries = 5;
  let delay = 1000;

  while (true) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        if ((response.status === 503 || response.status === 429) && attempt < maxRetries) {
           throw new Error(`Retryable error ${response.status}`);
        }
        throw new Error(`Lỗi kết nối AI (${response.status}). ${response.status === 403 || response.status === 401 ? 'Vui lòng kiểm tra API Key.' : 'Vui lòng thử lại sau.'}`);
      }
      
      const data = await response.json();
      const textRes = data.candidates?.[0]?.content?.parts?.[0]?.text;
      const cleanJson = textRes.replace(/```json|```/g, '').trim();
      return JSON.parse(cleanJson);

    } catch (error) {
      const isRetryable = error.message.includes('503') || error.message.includes('429') || error.message.includes('Retryable');
      
      if (attempt < maxRetries && isRetryable) {
        await new Promise(resolve => setTimeout(resolve, delay));
        attempt++;
        delay *= 2; 
      } else {
        console.error("API Error after retries:", error);
        throw error;
      }
    }
  }
};

const callGeminiAdvice = async (breakdownData) => {
  const userKey = safeLocalStorage.getItem('gemini_api_key');
  const activeKey = userKey ? userKey.trim() : apiKey;

  if (!activeKey || activeKey.length < 10) {
      return "Thưa gia chủ, tôi chưa thấy chìa khóa (API Key) để mở kho tàng tri thức. Xin hãy cập nhật trong phần Cài đặt.";
  }

  const prompt = `
  Bạn là một Quản gia già dặn, thông thái, và tận tụy của một gia đình quý tộc thời xưa. 
  Hãy đưa ra lời khuyên tài chính ngắn gọn (khoảng 3-4 câu) cho Gia chủ dựa trên số liệu tháng này:
  - Tổng thu: ${formatCurrency(breakdownData.income)}
  - Tổng chi: ${formatCurrency(breakdownData.expense)}
  - Số dư: ${formatCurrency(breakdownData.balance)}
  - Các khoản chi lớn nhất: ${breakdownData.catData.slice(0, 3).map(c => `${c.name} (${formatCurrency(c.value)})`).join(', ')}.

  Yêu cầu giọng văn:
  - Cổ điển, lịch sự, dùng từ ngữ trang trọng (ví dụ: "ngân khố", "thâm hụt", "tích cốc phòng cơ", "phung phí", "cân nhắc").
  - Nếu chi > thu: Nhắc nhở nhẹ nhàng nhưng nghiêm khắc về việc tiết kiệm.
  - Nếu thu > chi: Khen ngợi và gợi ý tích lũy hoặc đầu tư.
  - Nhận xét cụ thể về danh mục chi tiêu lớn nhất nếu thấy bất hợp lý.
  
  Chỉ trả về văn bản lời khuyên, không có tiêu đề hay markdown.
  `;

  const payload = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
  };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${activeKey}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) throw new Error("Lỗi kết nối Quản gia");
    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "Quản gia đang bận tính toán...";
  } catch (error) {
    console.error(error);
    return "Thưa gia chủ, sổ sách hiện đang rối bời, tôi chưa thể đưa ra lời khuyên lúc này.";
  }
};

// --- COMPONENTS ---

const WelcomeScreen = ({ onStart }) => {
  const [name, setName] = useState('');
  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{backgroundColor: '#E6E2D6'}}>
      <div className="w-full max-w-sm paper-texture vintage-shadow border border-[#DAA520] p-8 rounded-xl relative overflow-hidden animate-fade-in">
        <div className="absolute top-0 left-0 w-full h-1 bg-[#DAA520] opacity-50"></div>
        <div className="text-center mb-8">
           <h1 className="text-3xl font-heading font-bold text-[#4A403A] mb-2 font-heading"><span className="text-[#DAA520]">✦</span> Sổ Cái <span className="text-[#DAA520]">✦</span></h1>
           <p className="text-sm italic text-gray-500">Chào mừng chủ nhân</p>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); if(name.trim()) onStart(name); }} className="space-y-6">
           <div className="space-y-2">
              <label className="text-xs font-bold text-[#8FBC8F] uppercase">Xin cho biết quý danh</label>
              <div className="flex items-center gap-2 border-b-2 border-[#DAA520] py-2">
                 <User size={20} className="text-[#DAA520]"/>
                 <input type="text" required autoFocus className="w-full bg-transparent focus:outline-none text-[#4A403A] font-heading font-bold text-lg" placeholder="Tên của bạn..." value={name} onChange={e => setName(e.target.value)}/>
              </div>
           </div>
           <button type="submit" className="w-full bg-[#4A403A] text-[#FDFBF7] py-3 rounded-lg font-heading font-bold hover:bg-[#2d2723] transition-colors shadow-lg flex items-center justify-center gap-2 group">
             <Feather size={18} className="group-hover:rotate-12 transition-transform"/> Mở Khóa Sổ Cái
           </button>
        </form>
      </div>
    </div>
  );
};

const SettingsModal = ({ onClose }) => {
    const [key, setKey] = useState('');
    const [showKey, setShowKey] = useState(false);
    
    useEffect(() => {
        setKey(safeLocalStorage.getItem('gemini_api_key') || apiKey);
    }, []);

    const handleSave = () => {
        safeLocalStorage.setItem('gemini_api_key', key.trim());
        alert("Đã lưu chìa khóa thần chú thành công!");
        onClose();
    };

    return (
        <div className="modal-overlay animate-fade-in">
            <div className="w-full max-w-sm bg-[#FDFBF7] p-6 rounded-xl vintage-shadow border border-[#DAA520] relative">
                <button onClick={onClose} className="absolute top-3 right-3 text-gray-400 hover:text-red-500"><X size={20}/></button>
                <h3 className="font-heading font-bold text-lg text-[#4A403A] mb-4 text-center flex items-center justify-center gap-2">
                    <Settings size={20}/> Cài Đặt
                </h3>
                <div className="space-y-4">
                    <div>
                        <label className="text-xs font-bold text-[#8FBC8F] uppercase mb-1 block">Gemini API Key</label>
                        <div className="flex items-center gap-2 border border-gray-300 rounded-lg p-2 bg-white">
                            <Key size={16} className="text-gray-400"/>
                            <input 
                                type={showKey ? "text" : "password"} 
                                className="w-full bg-transparent focus:outline-none text-sm font-body"
                                placeholder="AIzaSy..."
                                value={key}
                                onChange={(e) => setKey(e.target.value)}
                            />
                            <button onClick={() => setShowKey(!showKey)} className="text-xs text-gray-400 hover:text-[#DAA520]">{showKey ? "Ẩn" : "Hiện"}</button>
                        </div>
                    </div>
                    <button onClick={handleSave} className="w-full bg-[#DAA520] text-white py-2 rounded-lg font-bold shadow hover:bg-[#B8860B] transition-colors">Lưu Cài Đặt</button>
                </div>
            </div>
        </div>
    );
};

const EditTransactionModal = ({ transaction, onClose, onSave, onDelete }) => {
  const [edited, setEdited] = useState({ ...transaction });
  
  const handleSave = () => {
    let validDate = new Date().toISOString();
    if (edited.date) {
        const d = new Date(edited.date);
        if (!isNaN(d.getTime())) validDate = d.toISOString();
    }
    onSave(transaction.id, { 
        ...edited, 
        amount: Number(edited.amount), 
        date: validDate 
    });
  };

  return (
    <div className="modal-overlay animate-fade-in">
      <div className="w-full max-w-sm bg-[#FDFBF7] p-6 rounded-xl vintage-shadow border border-[#DAA520] relative">
        <button onClick={onClose} className="absolute top-3 right-3 text-gray-400 hover:text-red-500"><X size={20}/></button>
        <h3 className="font-heading font-bold text-lg text-[#4A403A] mb-6 text-center">Phiếu Chi Tiết</h3>
        <div className="space-y-4">
           <div className="flex gap-2 justify-center mb-4">
              <button onClick={() => setEdited({...edited, type: 'expense'})} className={`px-4 py-1 rounded-full text-xs font-bold transition-colors ${edited.type === 'expense' ? 'bg-[#D8BFD8] text-[#4A403A]' : 'bg-gray-100 text-gray-400'}`}>Chi Tiêu</button>
              <button onClick={() => setEdited({...edited, type: 'income'})} className={`px-4 py-1 rounded-full text-xs font-bold transition-colors ${edited.type === 'income' ? 'bg-[#8FBC8F] text-[#4A403A]' : 'bg-gray-100 text-gray-400'}`}>Thu Nhập</button>
           </div>
           <div className="flex gap-3">
              <div className="flex-1"><label className="text-[10px] font-bold text-gray-400 uppercase">Số tiền</label><input type="number" className="w-full border-b border-[#DAA520] py-1 bg-transparent font-bold text-[#4A403A] focus:outline-none" value={edited.amount} onChange={e => setEdited({...edited, amount: e.target.value})}/></div>
              <div className="flex-1"><label className="text-[10px] font-bold text-gray-400 uppercase">Danh mục</label><select className="w-full border-b border-[#DAA520] py-1 bg-transparent font-body text-[#4A403A] focus:outline-none" value={edited.category} onChange={e => setEdited({...edited, category: e.target.value})}>{CATEGORY_LIST.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
           </div>
           <div><label className="text-[10px] font-bold text-gray-400 uppercase">Ngày</label><input type="date" className="w-full border-b border-[#DAA520] py-1 bg-transparent font-body text-[#4A403A] focus:outline-none" value={formatDate(edited.date).split('/').reverse().join('-')} onChange={e => setEdited({...edited, date: e.target.value})}/></div>
           <div><label className="text-[10px] font-bold text-gray-400 uppercase">Ghi chú</label><input type="text" className="w-full border-b border-[#DAA520] py-1 bg-transparent font-body text-[#4A403A] focus:outline-none" value={edited.note} onChange={e => setEdited({...edited, note: e.target.value})}/></div>
        </div>
        <div className="flex gap-3 mt-8">
           <button onClick={() => onDelete(transaction.id)} className="p-3 rounded-lg border border-red-200 text-red-400 hover:bg-red-50 transition-colors"><Trash2 size={18} /></button>
           <button onClick={handleSave} className="flex-1 bg-[#4A403A] text-[#FDFBF7] rounded-lg font-bold hover:bg-[#2d2723] transition-colors">Lưu Thay Đổi</button>
        </div>
      </div>
    </div>
  );
};

// --- NEW: EDIT RECURRING MODAL ---
const EditRecurringModal = ({ item, onClose, onSave, onDelete }) => {
  const [edited, setEdited] = useState({ ...item });
  const handleSave = () => {
    onSave(item.id, { ...edited, amount: parseFloat(edited.amount), day: parseInt(edited.day) });
  };
  return (
    <div className="modal-overlay animate-fade-in">
      <div className="w-full max-w-sm bg-[#FDFBF7] p-6 rounded-xl vintage-shadow border border-[#DAA520] relative">
        <button onClick={onClose} className="absolute top-3 right-3 text-gray-400 hover:text-red-500"><X size={20}/></button>
        <h3 className="font-heading font-bold text-lg text-[#4A403A] mb-6 text-center">Sửa Mục Định Kỳ</h3>
        <div className="space-y-4">
           <div className="flex gap-2"><div className="flex-1"><label className="text-[10px] font-bold text-gray-400 uppercase">Tên khoản chi</label><input type="text" className="w-full border-b border-[#DAA520] py-1 bg-transparent font-bold text-[#4A403A] focus:outline-none" value={edited.name} onChange={e => setEdited({...edited, name: e.target.value})}/></div></div>
           <div className="flex gap-3">
              <div className="flex-1"><label className="text-[10px] font-bold text-gray-400 uppercase">Số tiền</label><input type="number" className="w-full border-b border-[#DAA520] py-1 bg-transparent font-body text-[#4A403A] focus:outline-none" value={edited.amount} onChange={e => setEdited({...edited, amount: e.target.value})}/></div>
              <div className="w-1/3"><label className="text-[10px] font-bold text-gray-400 uppercase">Ngày (1-31)</label><input type="number" min="1" max="31" className="w-full border-b border-[#DAA520] py-1 bg-transparent font-body text-[#4A403A] focus:outline-none" value={edited.day} onChange={e => setEdited({...edited, day: e.target.value})}/></div>
           </div>
           <div className="flex gap-3">
              <div className="flex-1"><label className="text-[10px] font-bold text-gray-400 uppercase">Loại</label><select className="w-full border-b border-[#DAA520] py-1 bg-transparent font-body text-[#4A403A] focus:outline-none" value={edited.type} onChange={e => setEdited({...edited, type: e.target.value})}><option value="fixed">Chi Cố Định</option><option value="saving">Tiết Kiệm</option></select></div>
              <div className="flex-1"><label className="text-[10px] font-bold text-gray-400 uppercase">Danh mục</label><select className="w-full border-b border-[#DAA520] py-1 bg-transparent font-body text-[#4A403A] focus:outline-none" value={edited.category} onChange={e => setEdited({...edited, category: e.target.value})}>{CATEGORY_LIST.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
           </div>
        </div>
        <div className="flex gap-3 mt-8">
           <button onClick={() => onDelete(item.id)} className="p-3 rounded-lg border border-red-200 text-red-400 hover:bg-red-50 transition-colors"><Trash2 size={18} /></button>
           <button onClick={handleSave} className="flex-1 bg-[#4A403A] text-[#FDFBF7] rounded-lg font-bold hover:bg-[#2d2723] transition-colors">Cập Nhật</button>
        </div>
      </div>
    </div>
  );
};

// --- NEW: TREND LINE CHART (SVG) ---
const TrendLineChart = ({ monthlyData }) => {
  if (monthlyData.length < 2) return <div className="text-center text-xs text-gray-400 italic py-8">Cần ít nhất 2 tháng dữ liệu để vẽ xu hướng.</div>;
  
  const width = 300;
  const height = 150;
  const padding = 20;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;
  
  // Get data for last 6 months
  const data = monthlyData.slice(-6);
  const maxVal = Math.max(...data.flatMap(d => [d.income, d.expense]), 100000); // Min scale for visibility

  const getX = (index) => padding + (index / (data.length - 1)) * chartWidth;
  const getY = (val) => height - padding - (val / maxVal) * chartHeight;

  // Create Path Strings
  const createPath = (type) => {
    return data.map((d, i) => 
      `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(d[type])}`
    ).join(' ');
  };

  return (
    <div className="relative w-full h-48 mx-auto">
       <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible">
          {/* Grid lines */}
          <line x1={padding} y1={height-padding} x2={width-padding} y2={height-padding} stroke="#ddd" strokeWidth="1"/>
          <line x1={padding} y1={padding} x2={padding} y2={height-padding} stroke="#ddd" strokeWidth="1"/>

          {/* Income Line (Green) */}
          <path d={createPath('income')} fill="none" stroke="#8FBC8F" strokeWidth="2" />
          {/* Expense Line (Purple) */}
          <path d={createPath('expense')} fill="none" stroke="#D8BFD8" strokeWidth="2" />

          {/* Dots */}
          {data.map((d, i) => (
            <g key={i}>
               <circle cx={getX(i)} cy={getY(d.income)} r="3" fill="#8FBC8F" />
               <circle cx={getX(i)} cy={getY(d.expense)} r="3" fill="#D8BFD8" />
               <text x={getX(i)} y={height - 5} fontSize="8" textAnchor="middle" fill="#999">{d.month.split('/')[0]}</text>
            </g>
          ))}
       </svg>
       <div className="flex justify-center gap-4 mt-2 text-[10px]">
          <span className="flex items-center gap-1 text-[#8FBC8F] font-bold"><div className="w-2 h-2 bg-[#8FBC8F] rounded-full"></div> Thu Nhập</span>
          <span className="flex items-center gap-1 text-[#D8BFD8] font-bold"><div className="w-2 h-2 bg-[#D8BFD8] rounded-full"></div> Chi Tiêu</span>
       </div>
    </div>
  );
};

// --- CHART COMPONENTS ---
const DonutChart = ({ data, colors }) => {
  const total = data.reduce((acc, curr) => acc + curr.value, 0);
  let accumulatedAngle = 0;
  if (total === 0) return <div className="text-center text-gray-400 italic py-10">Chưa có dữ liệu...</div>;
  return (
    <div className="relative w-40 h-40 mx-auto animate-float">
      <svg viewBox="0 0 100 100" className="transform -rotate-90 w-full h-full drop-shadow-md">
        {data.map((item, index) => {
          const percentage = item.value / total;
          const angle = percentage * 360;
          const largeArcFlag = percentage > 0.5 ? 1 : 0;
          const x1 = 50 + 40 * Math.cos(Math.PI * accumulatedAngle / 180);
          const y1 = 50 + 40 * Math.sin(Math.PI * accumulatedAngle / 180);
          const endAngle = accumulatedAngle + angle;
          const x2 = 50 + 40 * Math.cos(Math.PI * endAngle / 180);
          const y2 = 50 + 40 * Math.sin(Math.PI * endAngle / 180);
          const pathData = `M 50 50 L ${x1} ${y1} A 40 40 0 ${largeArcFlag} 1 ${x2} ${y2} Z`;
          accumulatedAngle += angle;
          return <path key={index} d={pathData} fill={colors[index % colors.length]} stroke="#FDFBF7" strokeWidth="2"/>;
        })}
        <circle cx="50" cy="50" r="25" fill="#FDFBF7" />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none"><span className="text-[10px] font-bold text-gray-400 font-heading">Danh Mục</span></div>
    </div>
  );
};

const CalendarView = ({ recurringItems }) => {
    const today = new Date();
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [selectedDay, setSelectedDay] = useState(today.getDate());
    const daysInMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate();
    const firstDay = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).getDay();
    const getItemsForDay = (day) => recurringItems.filter(i => i.day === day);
    const selectedItems = getItemsForDay(selectedDay);
    return (
        <div className="bg-[#FDFBF7] p-4 rounded-xl vintage-shadow border border-[#DAA520] mb-6">
            <div className="flex justify-between items-center mb-4">
                <button onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))} className="p-1 hover:bg-gray-100 rounded"><ChevronLeft size={16}/></button>
                <h3 className="font-heading font-bold text-[#4A403A]">Tháng {currentMonth.getMonth() + 1} / {currentMonth.getFullYear()}</h3>
                <button onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))} className="p-1 hover:bg-gray-100 rounded"><ChevronRight size={16}/></button>
            </div>
            <div className="grid grid-cols-7 gap-1 mb-2 text-center">{['CN','T2','T3','T4','T5','T6','T7'].map(d=><span key={d} className="text-[10px] font-bold text-gray-400">{d}</span>)}</div>
            <div className="grid grid-cols-7 gap-1">
                {Array(firstDay).fill(null).map((_,i)=><div key={`empty-${i}`}/>)}
                {Array(daysInMonth).fill(null).map((_,i)=>{
                    const day=i+1; const items=getItemsForDay(day); const isSelected=day===selectedDay;
                    return (
                        <div key={day} onClick={()=>setSelectedDay(day)} className={`h-8 flex flex-col items-center justify-center rounded cursor-pointer transition-colors relative ${isSelected?'bg-[#DAA520] text-white shadow-md':'hover:bg-[#F5F1E6] text-[#4A403A]'}`}>
                            <span className="text-xs font-bold">{day}</span>
                            <div className="flex gap-0.5 mt-0.5">{items.some(x=>x.type==='fixed')&&<div className="w-1 h-1 rounded-full bg-rose-400"></div>}{items.some(x=>x.type==='saving')&&<div className="w-1 h-1 rounded-full bg-emerald-400"></div>}</div>
                        </div>
                    );
                })}
            </div>
            <div className="mt-4 pt-3 border-t border-dashed border-gray-300 min-h-[60px]">
                <p className="text-xs font-bold text-gray-400 mb-2 uppercase">Ngày {selectedDay}:</p>
                {selectedItems.length===0?<p className="text-xs italic text-gray-400">Không có lịch.</p>:<div className="space-y-2">{selectedItems.map(item=><div key={item.id} className="flex justify-between text-sm"><span>{item.name}</span><span className="font-bold">{item.amount.toLocaleString()}</span></div>)}</div>}
            </div>
        </div>
    );
};

const RecurringCard = ({ item, onDelete, onPay, onEdit }) => (
  <div onClick={() => onEdit && onEdit(item)} className="bg-[#FDFBF7] p-3 rounded-lg border border-[#E6E2D6] vintage-shadow mb-3 flex justify-between items-center group cursor-pointer hover:bg-slate-50 transition-colors relative">
    <div className="flex items-center gap-3">
      <div className={`p-2 rounded-full ${item.type === 'fixed' ? 'bg-rose-100 text-rose-600' : 'bg-emerald-100 text-emerald-600'}`}>{item.type === 'fixed' ? <Shield size={16}/> : <Coins size={16}/>}</div>
      <div><p className="font-heading font-bold text-[#4A403A]">{item.name}</p><p className="text-xs text-gray-500 italic">Ngày {item.day} hàng tháng</p></div>
    </div>
    <div className="text-right">
      <p className="font-bold text-[#4A403A]">{item.amount.toLocaleString()}đ</p>
      <div className="flex gap-2 justify-end mt-1">
         <button onClick={(e) => { e.stopPropagation(); onPay(item); }} className="text-[10px] bg-[#DAA520] text-white px-2 py-0.5 rounded hover:bg-[#B8860B] z-10 relative">Ghi sổ</button>
      </div>
    </div>
    <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity"><Edit3 size={12} className="text-gray-400"/></div>
  </div>
);

const ReminderNote = ({ items, onDismiss }) => {
  if (items.length === 0) return null;
  return (
    <div className="mx-6 mb-6 sticky-note p-4 rotate-1 relative animate-float">
      <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 w-4 h-4 rounded-full bg-red-400 shadow-sm border border-red-500"></div>
      <h3 className="font-heading font-bold text-[#4A403A] mb-2 flex items-center gap-2"><Bell size={16} className="text-red-500"/> Nhắc Nhở</h3>
      <ul className="text-sm font-body text-[#4A403A] space-y-1 pl-4 list-disc">{items.map(i => (<li key={i.id}>Hôm nay: <span className="font-bold">{i.name}</span></li>))}</ul>
      <button onClick={onDismiss} className="absolute top-1 right-1 text-gray-500 hover:text-red-500"><X size={14}/></button>
    </div>
  );
};

const TransactionList = ({ transactions, onEdit }) => (
    <div className="space-y-2">
        {transactions.map(t => (
            <div key={t.id} onClick={() => onEdit && onEdit(t)} className="bg-white p-3 rounded-lg mb-2 flex justify-between items-center border border-[#E6E2D6] shadow-sm relative group cursor-pointer hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center bg-[#FDFBF7] border ${t.type==='income'?'border-[#8FBC8F] text-[#8FBC8F]':'border-[#D8BFD8] text-[#D8BFD8]'}`}>{t.type==='income' ? <TrendingUp size={14}/> : <TrendingDown size={14}/>}</div>
                    <div><p className="font-heading font-bold text-sm text-[#4A403A]">{t.category}</p><p className="text-xs text-gray-500 italic max-w-[150px] truncate">{t.note}</p></div>
                </div>
                <div className="text-right"><p className={`font-bold text-sm ${t.type==='income'?'text-[#8FBC8F]':'text-[#D8BFD8]'}`}>{t.type==='income'?'+':'-'}{t.amount.toLocaleString()}</p><p className="text-[10px] text-gray-400">{formatDate(t.date)}</p></div>
                <div className="absolute right-2 top-1/2 transform -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-white p-1 rounded shadow"><Edit3 size={14} className="text-[#DAA520]" /></div>
            </div>
        ))}
    </div>
);

// --- MAIN APP ---
export default function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [hasJoined, setHasJoined] = useState(false); 
  const [activeTab, setActiveTab] = useState('home');
  const [transactions, setTransactions] = useState([]);
  const [recurringItems, setRecurringItems] = useState([]);
  const [inputText, setInputText] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [detectedData, setDetectedData] = useState([]);
  const [showReminders, setShowReminders] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [editingRecurring, setEditingRecurring] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [showSettings, setShowSettings] = useState(false); 

  // New state for Financial Advice
  const [advice, setAdvice] = useState('');
  const [adviceLoading, setAdviceLoading] = useState(false);

  const [newPlanName, setNewPlanName] = useState('');
  const [newPlanAmount, setNewPlanAmount] = useState('');
  const [newPlanDay, setNewPlanDay] = useState(1);
  const [newPlanType, setNewPlanType] = useState('fixed');
  const [newPlanCat, setNewPlanCat] = useState('Hóa đơn');

  const recognitionRef = useRef(null);

  // --- AUTH & INIT ---
  useEffect(() => {
    const savedUser = safeLocalStorage.getItem('vintage_user');
    if (!USE_CLOUD_STORAGE && savedUser) {
      setUser(JSON.parse(savedUser));
      setHasJoined(true);
      setAuthLoading(false);
    } else if (USE_CLOUD_STORAGE) {
      const unsub = onAuthStateChanged(auth, (u) => {
        setUser(u);
        if(u?.displayName) setHasJoined(true);
        setAuthLoading(false);
      });
      return () => unsub();
    } else {
      setAuthLoading(false); 
    }
  }, []);

  // --- VOICE SETUP ---
  useEffect(() => {
    if (typeof window !== 'undefined' && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        recognitionRef.current = new SpeechRecognition();
        recognitionRef.current.continuous = false;
        recognitionRef.current.lang = 'vi-VN';
        recognitionRef.current.interimResults = false;

        recognitionRef.current.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            setInputText(transcript);
            handleAI('text', transcript);
            setIsRecording(false);
        };

        recognitionRef.current.onerror = (event) => {
            console.error("Speech error", event);
            setIsRecording(false);
        };
        
        recognitionRef.current.onend = () => setIsRecording(false);
    }
  }, []);

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

  // --- DATA SYNC ---
  useEffect(() => {
    if (!user) return;
    if (USE_CLOUD_STORAGE) {
      const qTrans = query(collection(db, 'artifacts', appId, 'users', user.uid, 'transactions'), orderBy('date', 'desc'));
      const unsubTrans = onSnapshot(qTrans, (snapshot) => setTransactions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))));
      const qRecur = query(collection(db, 'artifacts', appId, 'users', user.uid, 'recurring'));
      const unsubRecur = onSnapshot(qRecur, (snapshot) => setRecurringItems(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))));
      return () => { unsubTrans(); unsubRecur(); };
    } else {
      const localTrans = mockLocalStorage.get(`trans_${user.uid}`);
      setTransactions(localTrans.sort((a,b) => new Date(b.date) - new Date(a.date)));
      const localRecur = mockLocalStorage.get(`recur_${user.uid}`);
      setRecurringItems(localRecur);
    }
  }, [user, activeTab]); 

  const handleStart = (name) => {
    const safeNameId = name.trim().toLowerCase().replace(/\s+/g, '_');
    const newUser = { uid: 'local_' + safeNameId, displayName: name };
    if (!USE_CLOUD_STORAGE) {
      safeLocalStorage.setItem('vintage_user', JSON.stringify(newUser));
      setUser(newUser);
      setHasJoined(true);
    }
  };

  const handleLogout = () => {
    if(USE_CLOUD_STORAGE) signOut(auth);
    else {
      safeLocalStorage.removeItem('vintage_user');
      setUser(null);
      setHasJoined(false);
    }
  };

  const handleAI = async (type, payload) => {
    setAnalyzing(true);
    setErrorMsg('');
    try {
      let results = [];
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
            type: i.type === 'income' ? 'income' : 'expense',
            category: i.category || 'Khác',
            note: i.note || 'Ghi chép mới'
        };
      });
      if (normalized.length === 0) throw new Error("Không tìm thấy thông tin tài chính nào!");
      setDetectedData(normalized);
    } catch (e) {
      console.error(e);
      setErrorMsg("AI Lỗi: " + e.message);
      setTimeout(() => setErrorMsg(''), 8000);
    } finally {
      setAnalyzing(false);
    }
  };

  const removeDetectedItem = (index) => {
    const newData = [...detectedData];
    newData.splice(index, 1);
    setDetectedData(newData);
  };

  const saveTransactions = async () => {
    if(!user) return;
    const itemsToSave = detectedData.filter(t => t.amount > 0);
    if (USE_CLOUD_STORAGE) {
      for (const item of itemsToSave) {
        await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'transactions'), { ...item, createdAt: serverTimestamp() });
      }
    } else {
      itemsToSave.forEach(item => mockLocalStorage.add(`trans_${user.uid}`, item));
      const updatedData = mockLocalStorage.get(`trans_${user.uid}`);
      setTransactions(updatedData.sort((a,b) => new Date(b.date) - new Date(a.date)));
    }
    setDetectedData([]);
    setInputText('');
    setActiveTab('home');
  };

  const handleUpdateTransaction = async (id, newData) => {
    if (!user) return;
    if (USE_CLOUD_STORAGE) {
      await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'transactions', id), newData);
    } else {
      mockLocalStorage.update(`trans_${user.uid}`, id, newData);
      setTransactions(mockLocalStorage.get(`trans_${user.uid}`).sort((a,b) => new Date(b.date) - new Date(a.date)));
    }
    setEditingTransaction(null);
  };

  const handleDeleteTransaction = async (id) => {
    if (!user) return;
    if (USE_CLOUD_STORAGE) {
      await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'transactions', id));
    } else {
      mockLocalStorage.delete(`trans_${user.uid}`, id);
      setTransactions(mockLocalStorage.get(`trans_${user.uid}`).sort((a,b) => new Date(b.date) - new Date(a.date)));
    }
    setEditingTransaction(null);
  };

  const addRecurring = async () => {
    if (!newPlanName || !newPlanAmount || !user) return;
    const item = { name: newPlanName, amount: parseFloat(newPlanAmount), day: parseInt(newPlanDay), type: newPlanType, category: newPlanCat };
    if (USE_CLOUD_STORAGE) {
      await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'recurring'), item);
    } else {
      mockLocalStorage.add(`recur_${user.uid}`, item);
      setRecurringItems(mockLocalStorage.get(`recur_${user.uid}`));
    }
    setNewPlanName(''); setNewPlanAmount('');
  };

  const handleUpdateRecurring = async (id, newData) => {
    if (!user) return;
    if (USE_CLOUD_STORAGE) {
      await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'recurring', id), newData);
    } else {
      mockLocalStorage.update(`recur_${user.uid}`, id, newData);
      setRecurringItems(mockLocalStorage.get(`recur_${user.uid}`));
    }
    setEditingRecurring(null);
  };

  const deleteRecurring = async (id) => {
    if (!user) return;
    if (USE_CLOUD_STORAGE) {
      await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'recurring', id));
    } else {
      mockLocalStorage.delete(`recur_${user.uid}`, id);
      setRecurringItems(mockLocalStorage.get(`recur_${user.uid}`));
    }
    setEditingRecurring(null);
  };

  const payRecurring = async (item) => {
    if (!user) return;
    const t = { amount: item.amount, type: 'expense', category: item.category, note: `Định kỳ: ${item.name}`, date: new Date().toISOString() };
    if(USE_CLOUD_STORAGE) await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'transactions'), { ...t, createdAt: serverTimestamp() });
    else {
      mockLocalStorage.add(`trans_${user.uid}`, t);
      setTransactions(mockLocalStorage.get(`trans_${user.uid}`).sort((a,b) => new Date(b.date) - new Date(a.date)));
    }
    alert(`Đã ghi chép "${item.name}" vào sổ cái!`);
  };

  const handleGetAdvice = async (breakdownData) => {
    setAdviceLoading(true);
    const text = await callGeminiAdvice(breakdownData);
    setAdvice(text);
    setAdviceLoading(false);
  };

  const monthlyData = useMemo(() => {
      const groups = {};
      transactions.forEach(t => {
          const date = new Date(t.date);
          if (isNaN(date.getTime())) return;
          const key = `${date.getMonth()+1}/${date.getFullYear()}`;
          if (!groups[key]) groups[key] = { month: key, income: 0, expense: 0 };
          if (t.type === 'income') groups[key].income += t.amount;
          else groups[key].expense += t.amount;
      });
      return Object.values(groups).sort((a,b) => {
          const [m1, y1] = a.month.split('/').map(Number);
          const [m2, y2] = b.month.split('/').map(Number);
          return (y1*12 + m1) - (y2*12 + m2);
      });
  }, [transactions]);

  // --- NEW: Monthly Breakdown Logic ---
  const [reportMonth, setReportMonth] = useState(new Date());

  const monthlyBreakdown = useMemo(() => {
      const targetMonth = reportMonth.getMonth();
      const targetYear = reportMonth.getFullYear();
      
      const filtered = transactions.filter(t => {
          const d = new Date(t.date);
          return d.getMonth() === targetMonth && d.getFullYear() === targetYear;
      });

      const income = filtered.filter(t => t.type === 'income').reduce((acc, t) => acc + t.amount, 0);
      const expense = filtered.filter(t => t.type === 'expense').reduce((acc, t) => acc + t.amount, 0);
      
      // Detailed Categories
      const catData = filtered.filter(t => t.type === 'expense').reduce((acc, t) => {
          const exist = acc.find(i => i.name === t.category);
          if (exist) exist.value += t.amount;
          else acc.push({ name: t.category, value: t.amount });
          return acc;
      }, []).sort((a,b) => b.value - a.value);

      return { income, expense, balance: income - expense, catData };
  }, [transactions, reportMonth]);

  const today = new Date().getDate();
  const dueItems = recurringItems.filter(i => i.day === today);

  // [SSR FIX] Return null or a loading spinner until mounted
  if (!isMounted) return <div className="min-h-screen flex items-center justify-center bg-[#E6E2D6]"><Sparkles className="animate-spin text-[#DAA520]"/></div>;

  if (authLoading) return <div className="min-h-screen flex items-center justify-center bg-[#E6E2D6]"><Sparkles className="animate-spin text-[#DAA520]"/></div>;
  if (!hasJoined) return <WelcomeScreen onStart={handleStart} />;

  // Renders
  const renderHome = () => {
    const totalIncome = transactions.filter(t => t.type === 'income').reduce((acc, t) => acc + t.amount, 0);
    const totalExpense = transactions.filter(t => t.type === 'expense').reduce((acc, t) => acc + t.amount, 0);

    return (
      <div className="pb-32 animate-fade-in"> 
        <div className="p-6 pb-4 relative z-10 text-center flex justify-between items-center">
             <button onClick={() => setShowSettings(true)} className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-[#DAA520] rounded-full hover:bg-[#FDFBF7]">
                <Settings size={18}/>
             </button>
             <h2 className="text-3xl font-heading font-bold text-[#4A403A] tracking-wide relative inline-block">
               <span className="text-4xl text-[#DAA520]">✦</span> Tổng Quan <span className="text-4xl text-[#DAA520]">✦</span>
             </h2>
             <button onClick={handleLogout} className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-red-500 rounded-full hover:bg-[#FDFBF7]">
               <LogOut size={18} />
             </button>
        </div>

        {showReminders && <ReminderNote items={dueItems} onDismiss={() => setShowReminders(false)} />}

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
          <TransactionList transactions={transactions.slice(0, 5)} onEdit={setEditingTransaction} />
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
                   <TransactionList transactions={transactions} onEdit={setEditingTransaction} />
                </div>
            )}
        </div>
    </div>
  );

  const renderAdd = () => (
    <div className="h-screen flex flex-col bg-[#FDFBF7]">
      <div className="p-6 text-center">
        <h2 className="text-2xl font-heading text-[#4A403A]">Ghi Chép Mới</h2>
        <p className="text-gray-400 italic text-sm">"20tr tiền lương", "Cafe 30k"...</p>
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
                    <select 
                      className="font-heading font-bold text-[#8FBC8F] bg-transparent border-b border-gray-300 focus:outline-none w-1/2 text-sm"
                      value={item.category}
                      onChange={(e) => {
                        const newData = [...detectedData];
                        newData[idx].category = e.target.value;
                        setDetectedData(newData);
                      }}
                    >
                      {CATEGORY_LIST.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    
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
                      value={formatDate(item.date).split('/').reverse().join('-')}
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
              const file = e.target.files[0];
              if(file) {
                 handleAI('image', file);
                 e.target.value = null; 
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

  const renderPlan = () => (
    <div className="pb-32 animate-fade-in px-6"> 
      <div className="p-6 pb-2 text-center">
         <h2 className="text-3xl font-heading font-bold text-[#4A403A]">
           <span className="text-[#DAA520]">✦</span> Kế Hoạch <span className="text-4xl text-[#DAA520]">✦</span>
         </h2>
         <p className="text-gray-500 text-sm italic">Chi tiêu cố định & Lịch thanh toán</p>
      </div>

      <CalendarView recurringItems={recurringItems} />

      <div className="bg-white p-4 rounded-xl vintage-shadow border border-[#DAA520] mb-6">
         <h3 className="font-bold text-[#4A403A] mb-3 text-sm uppercase flex items-center gap-2">
            <Plus size={16} className="text-[#DAA520]"/> Thêm Mục Định Kỳ
         </h3>
         <div className="space-y-3">
            <input 
               placeholder="Tên (VD: Thuê nhà)" 
               className="w-full border-b border-gray-200 py-1 text-sm focus:outline-none font-body"
               value={newPlanName} onChange={e=>setNewPlanName(e.target.value)}
            />
            <div className="flex gap-2">
               <input 
                 type="number" placeholder="Số tiền" 
                 className="w-2/3 border-b border-gray-200 py-1 text-sm focus:outline-none"
                 value={newPlanAmount} onChange={e=>setNewPlanAmount(e.target.value)}
               />
               <input 
                 type="number" min="1" max="31" placeholder="Ngày" 
                 className="w-1/3 border-b border-gray-200 py-1 text-sm focus:outline-none"
                 value={newPlanDay} onChange={e=>setNewPlanDay(e.target.value)}
               />
            </div>
            <div className="flex gap-2">
               <select className="w-1/2 bg-transparent border-b border-gray-200 py-1 text-sm" value={newPlanType} onChange={e=>setNewPlanType(e.target.value)}>
                  <option value="fixed">Chi Cố Định</option>
                  <option value="saving">Tiết Kiệm</option>
               </select>
               <select className="w-1/2 bg-transparent border-b border-gray-200 py-1 text-sm" value={newPlanCat} onChange={e=>setNewPlanCat(e.target.value)}>
                  {CATEGORY_LIST.map(c => <option key={c} value={c}>{c}</option>)}
               </select>
            </div>
            <button onClick={addRecurring} className="w-full bg-[#4A403A] text-[#FDFBF7] py-2 rounded-lg text-sm font-bold mt-2 hover:bg-[#2d2723]">
               Thêm
            </button>
         </div>
      </div>

      <div className="space-y-4">
         {recurringItems.map(item => (
            <RecurringCard key={item.id} item={item} onDelete={(id) => deleteRecurring(id)} onPay={payRecurring} onEdit={setEditingRecurring}/>
         ))}
      </div>
    </div>
  );

  const renderReport = () => {
    const colors = ['#8FBC8F', '#D8BFD8', '#E0A96D', '#ADD8E6', '#F08080', '#DAA520'];

    return (
      <div className="pb-32 animate-fade-in px-6"> 
        <div className="p-6 pb-2 text-center">
             <h2 className="text-3xl font-heading font-bold text-[#4A403A]">
               <span className="text-[#DAA520]">✦</span> Tổng Kết <span className="text-4xl text-[#DAA520]">✦</span>
             </h2>
             <p className="text-gray-500 text-sm italic">Góc nhìn toàn cảnh & Chi tiết</p>
        </div>

        {/* AI Advice Section */}
        <div className="mb-6">
           <button 
             onClick={() => handleGetAdvice(monthlyBreakdown)} 
             className="w-full bg-[#4A403A] text-[#FDFBF7] py-3 rounded-lg font-heading font-bold vintage-shadow hover:bg-[#2d2723] transition-colors flex items-center justify-center gap-2 mb-4"
             disabled={adviceLoading}
           >
             {adviceLoading ? <Sparkles className="animate-spin"/> : <MessageSquareQuote size={20}/>}
             {adviceLoading ? "Quản gia đang suy ngẫm..." : "Xin Lời Khuyên"}
           </button>
           
           {advice && (
             <div className="bg-[#FDFBF7] p-4 rounded-xl border border-[#DAA520] relative animate-scale-in">
               <div className="absolute -top-3 left-4 bg-[#DAA520] text-white text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider">Lời Quản Gia</div>
               <p className="text-sm font-body italic text-[#4A403A] leading-relaxed whitespace-pre-line">
                 "{advice}"
               </p>
               <button onClick={() => setAdvice('')} className="absolute top-2 right-2 text-gray-400 hover:text-red-500"><X size={14}/></button>
             </div>
           )}
        </div>

        {/* 1. TREND CHART (6 MONTHS) */}
        <div className="bg-white rounded-xl p-4 border border-[#E6E2D6] vintage-shadow mb-6">
             <h3 className="font-heading text-lg font-bold text-[#4A403A] flex items-center gap-2 mb-4">
                 <Activity size={18}/> Xu Hướng (6 Tháng)
             </h3>
             <TrendLineChart monthlyData={monthlyData} />
        </div>

        {/* 2. MONTHLY FILTER & BREAKDOWN */}
        <div className="bg-[#FDFBF7] rounded-xl p-6 border border-[#E6E2D6] vintage-shadow mb-6">
            <div className="flex justify-between items-center mb-4 border-b border-[#DAA520] pb-2">
                <button onClick={() => setReportMonth(new Date(reportMonth.getFullYear(), reportMonth.getMonth() - 1, 1))}><ChevronLeft size={20}/></button>
                <h3 className="font-heading font-bold text-lg text-[#4A403A]">
                    Tháng {reportMonth.getMonth() + 1}/{reportMonth.getFullYear()}
                </h3>
                <button onClick={() => setReportMonth(new Date(reportMonth.getFullYear(), reportMonth.getMonth() + 1, 1))}><ChevronRight size={20}/></button>
            </div>

            {/* Income vs Expense Bar */}
            <div className="mb-6">
                <div className="flex justify-between text-xs mb-1 font-bold text-[#4A403A]">
                    <span>Thu: {formatCurrency(monthlyBreakdown.income)}</span>
                    <span>Chi: {formatCurrency(monthlyBreakdown.expense)}</span>
                </div>
                <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden flex">
                    <div style={{ width: `${(monthlyBreakdown.income / (monthlyBreakdown.income + monthlyBreakdown.expense || 1)) * 100}%` }} className="h-full bg-[#8FBC8F]"></div>
                    <div style={{ width: `${(monthlyBreakdown.expense / (monthlyBreakdown.income + monthlyBreakdown.expense || 1)) * 100}%` }} className="h-full bg-[#D8BFD8]"></div>
                </div>
                <p className="text-center text-xs mt-2 italic text-gray-500">
                    Số dư: <span className={monthlyBreakdown.balance >= 0 ? "text-[#8FBC8F] font-bold" : "text-red-500 font-bold"}>{formatCurrency(monthlyBreakdown.balance)}</span>
                </p>
            </div>

            {/* Detailed Category Donut */}
            <h3 className="font-heading text-sm font-bold mb-4 text-[#4A403A] flex items-center justify-center gap-2">
              <PieChart size={16}/> Cơ Cấu Chi Tiêu
            </h3>
            <DonutChart data={monthlyBreakdown.catData} colors={colors} />
            
            <div className="mt-6 space-y-2">
              {monthlyBreakdown.catData.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between text-sm border-b border-gray-100 pb-1">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{backgroundColor: colors[idx % colors.length]}}></div>
                    <span className="font-bold text-[#4A403A]">{item.name}</span>
                  </div>
                  <span className="text-gray-600">{formatCurrency(item.value)}</span>
                </div>
              ))}
              {monthlyBreakdown.catData.length === 0 && <p className="text-center text-xs italic text-gray-400">Chưa có chi tiêu trong tháng này.</p>}
            </div>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-md mx-auto min-h-screen relative shadow-2xl overflow-hidden" style={{backgroundColor: '#E6E2D6'}}>
      <div className="h-full">
        {activeTab === 'home' && renderHome()}
        {activeTab === 'add' && renderAdd()}
        {activeTab === 'plan' && renderPlan()}
        {activeTab === 'report' && renderReport()}
        {activeTab === 'history' && renderHistory()}
      </div>
      
      {/* Edit Transaction Modal */}
      {editingTransaction && (
        <EditTransactionModal 
          transaction={editingTransaction}
          onClose={() => setEditingTransaction(null)}
          onSave={handleUpdateTransaction}
          onDelete={handleDeleteTransaction}
        />
      )}

      {/* Edit Recurring Modal */}
      {editingRecurring && (
        <EditRecurringModal 
          item={editingRecurring}
          onClose={() => setEditingRecurring(null)}
          onSave={handleUpdateRecurring}
          onDelete={deleteRecurring}
        />
      )}

      {/* Settings Modal */}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}

      {/* Navigation Fixed Bottom - Updated Layout */}
      <div className="fixed bottom-6 left-6 right-6 max-w-xs mx-auto z-50 flex items-center justify-center">
        <div className="absolute inset-0 paper-texture rounded-full vintage-shadow border border-[#E6E2D6]"></div>
        <div className="relative flex justify-between w-full px-4 py-3 items-center">
            <div className="flex gap-6 pl-2">
                <button onClick={() => setActiveTab('home')} className={`transition-colors flex flex-col items-center ${activeTab === 'home' ? 'text-[#8FBC8F]' : 'text-gray-400'}`}><Home size={22} /></button>
                <button onClick={() => setActiveTab('plan')} className={`transition-colors flex flex-col items-center ${activeTab === 'plan' ? 'text-[#DAA520]' : 'text-gray-400'}`}><CalendarIcon size={22} /></button>
            </div>
            <div className="w-12"></div>
            <div className="flex gap-6 pr-2">
                <button onClick={() => setActiveTab('report')} className={`transition-colors flex flex-col items-center ${activeTab === 'report' ? 'text-[#D8BFD8]' : 'text-gray-400'}`}><PieChart size={22} /></button>
                <button onClick={() => setActiveTab('history')} className={`transition-colors flex flex-col items-center ${activeTab === 'history' ? 'text-[#4A403A]' : 'text-gray-400'}`}><Scroll size={22} /></button>
            </div>
        </div>
        <button onClick={() => setActiveTab('add')} className="absolute bottom-6 bg-[#DAA520] text-white w-14 h-14 rounded-full flex items-center justify-center shadow-lg border-4 border-[#E6E2D6] transition-transform hover:scale-110 z-20"><Plus size={28} /></button>
      </div>
    </div>
  );
}
