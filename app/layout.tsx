import './globals.css';
import type { ReactNode } from 'react';

export const metadata = {
  title: 'Marketing Schedule Tracker',
  description: 'Marketing schedule tracking app',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white">
        {children}
      </body>
    </html>
  );
}
