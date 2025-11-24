'use client';

import { TrendingUp, TrendingDown, Edit3 } from 'lucide-react';
import { Transaction } from '@/lib/types';
import { formatDate } from '@/lib/utils';

interface TransactionListProps {
  transactions: Transaction[];
  onEdit?: (transaction: Transaction) => void;
}

export default function TransactionList({ transactions, onEdit }: TransactionListProps) {
  return (
    <div className="space-y-2">
      {transactions.map(t => (
        <div
          key={t.id}
          onClick={() => onEdit && onEdit(t)}
          className="bg-white p-3 rounded-lg mb-2 flex justify-between items-center border border-[#E6E2D6] shadow-sm relative group cursor-pointer hover:bg-slate-50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center bg-[#FDFBF7] border ${t.type==='income'?'border-[#8FBC8F] text-[#8FBC8F]':'border-[#D8BFD8] text-[#D8BFD8]'}`}>
              {t.type==='income' ? <TrendingUp size={14}/> : <TrendingDown size={14}/>}
            </div>
            <div>
              <p className="font-heading font-bold text-sm text-[#4A403A]">{t.category}</p>
              <p className="text-xs text-gray-500 italic max-w-[150px] truncate">{t.note}</p>
            </div>
          </div>
          <div className="text-right">
            <p className={`font-bold text-sm ${t.type==='income'?'text-[#8FBC8F]':'text-[#D8BFD8]'}`}>
              {t.type==='income'?'+':'-'}{t.amount.toLocaleString()}
            </p>
            <p className="text-[10px] text-gray-400">{formatDate(t.date)}</p>
          </div>
          <div className="absolute right-2 top-1/2 transform -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-white p-1 rounded shadow">
            <Edit3 size={14} className="text-[#DAA520]" />
          </div>
        </div>
      ))}
    </div>
  );
}
