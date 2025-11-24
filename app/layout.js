import { Lora, Playfair_Display } from 'next/font/google'
import './globals.css'

const lora = Lora({ 
  subsets: ['latin', 'vietnamese'],
  variable: '--font-body',
  display: 'swap',
})

const playfair = Playfair_Display({ 
  subsets: ['latin', 'vietnamese'],
  variable: '--font-heading',
  display: 'swap',
})

export const metadata = {
  title: 'Sổ Cái Vintage',
  description: 'Ứng dụng quản lý tài chính phong cách cổ điển',
}

export default function RootLayout({ children }) {
  return (
    <html lang="vi">
      <body className={`${lora.variable} ${playfair.variable} font-body`}>{children}</body>
    </html>
  )
}
