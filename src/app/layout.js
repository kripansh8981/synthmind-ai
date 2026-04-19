import './globals.css';
import { Toaster } from 'react-hot-toast';

export const metadata = {
  title: 'SynthMind — AI Document Intelligence',
  description: 'Advanced AI-powered document analysis with multi-stage RAG pipeline. Upload documents and get intelligent answers.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
        <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🧠</text></svg>" />
      </head>
      <body>
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: '#13132b',
              color: '#e2e8f0',
              border: '1px solid #2a2a5a',
              borderRadius: '12px',
            },
            success: {
              iconTheme: { primary: '#06d6a0', secondary: '#13132b' },
            },
            error: {
              iconTheme: { primary: '#ef4444', secondary: '#13132b' },
            },
          }}
        />
        {children}
      </body>
    </html>
  );
}
