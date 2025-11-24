'use client';

import { MonthlyData } from '@/lib/types';

interface MonthlyBarChartProps {
  monthlyData: MonthlyData[];
}

export default function MonthlyBarChart({ monthlyData }: MonthlyBarChartProps) {
  const maxVal = Math.max(...monthlyData.flatMap(d => [d.income, d.expense]), 1);

  return (
    <div className="flex items-end justify-between h-32 w-full gap-2 mt-4 px-2">
      {monthlyData.slice(-6).map((item, idx) => (
        <div key={idx} className="flex flex-col items-center gap-1 flex-1">
          <div className="flex gap-1 items-end h-full w-full justify-center">
            <div
              style={{height: `${(item.income / maxVal) * 100}%`}}
              className="w-2 bg-[#8FBC8F] rounded-t-sm opacity-80"
            ></div>
            <div
              style={{height: `${(item.expense / maxVal) * 100}%`}}
              className="w-2 bg-[#D8BFD8] rounded-t-sm opacity-80"
            ></div>
          </div>
          <span className="text-[8px] text-gray-500 font-body">{item.month.split('/')[0]}</span>
        </div>
      ))}
    </div>
  );
}
