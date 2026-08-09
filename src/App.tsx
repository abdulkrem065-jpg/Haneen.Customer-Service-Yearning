import React from 'react';
import { ChatInterface } from './components/ChatInterface';

function App() {
  return (
    <div className="h-screen w-full font-sans bg-slate-100">
      <main className="max-w-5xl mx-auto h-full shadow-2xl overflow-hidden sm:border-x border-slate-200">
        <ChatInterface />
      </main>
    </div>
  );
}

export default App;
