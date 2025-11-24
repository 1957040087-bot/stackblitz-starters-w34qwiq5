'use client';

interface DonutChartProps {
  data: { name: string; value: number }[];
  colors: string[];
}

export default function DonutChart({ data, colors }: DonutChartProps) {
  const total = data.reduce((acc, curr) => acc + curr.value, 0);
  let accumulatedAngle = 0;

  if (total === 0) {
    return <div className="text-center text-gray-400 italic py-10">Chưa có dữ liệu...</div>;
  }

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
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <span className="text-[10px] font-bold text-gray-400 font-heading">Chi Tiêu</span>
      </div>
    </div>
  );
}
