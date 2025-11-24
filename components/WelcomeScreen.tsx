'use client';

import { useState } from 'react';
import { User, Feather } from 'lucide-react';

interface WelcomeScreenProps {
  onStart: (name: string) => void;
}

export default function WelcomeScreen({ onStart }: WelcomeScreenProps) {
  const [name, setName] = useState('');

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{backgroundColor: '#E6E2D6'}}>
      <div className="w-full max-w-sm paper-texture vintage-shadow border border-[#DAA520] p-8 rounded-xl relative overflow-hidden animate-fade-in">
        <div className="absolute top-0 left-0 w-full h-1 bg-[#DAA520] opacity-50"></div>
        <div className="text-center mb-8">
          <h1 className="text-3xl font-heading font-bold text-[#4A403A] mb-2">
            <span className="text-[#DAA520]">✦</span> Sổ Cái <span className="text-[#DAA520]">✦</span>
          </h1>
          <p className="text-sm italic text-gray-500">Chào mừng chủ nhân</p>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); if(name.trim()) onStart(name); }} className="space-y-6">
          <div className="space-y-2">
            <label className="text-xs font-bold text-[#8FBC8F] uppercase">Xin cho biết quý danh</label>
            <div className="flex items-center gap-2 border-b-2 border-[#DAA520] py-2">
              <User size={20} className="text-[#DAA520]"/>
              <input
                type="text"
                required
                autoFocus
                className="w-full bg-transparent focus:outline-none text-[#4A403A] font-heading font-bold text-lg"
                placeholder="Tên của bạn..."
                value={name}
                onChange={e => setName(e.target.value)}
              />
            </div>
          </div>
          <button type="submit" className="w-full bg-[#4A403A] text-[#FDFBF7] py-3 rounded-lg font-heading font-bold hover:bg-[#2d2723] transition-colors shadow-lg flex items-center justify-center gap-2 group">
            <Feather size={18} className="group-hover:rotate-12 transition-transform"/> Mở Khóa Sổ Cái
          </button>
        </form>
      </div>
    </div>
  );
}
