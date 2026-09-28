import { Link } from "react-router-dom";

export function HomePage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-250px)] text-center px-4 relative">
      <div 
        className="absolute inset-0 z-[-1] opacity-20 pointer-events-none"
        style={{ 
          backgroundImage: 'radial-gradient(circle at center, rgba(0, 229, 208, 0.15) 0%, transparent 50%)'
        }}
      ></div>

      <h1 className="text-5xl sm:text-6xl md:text-[6.5rem] font-bold text-white leading-[1.05] tracking-tight max-w-5xl font-sans uppercase">
        CodeClash
      </h1>
      
      <p className="mt-6 text-xl md:text-2xl text-df-cyan max-w-3xl font-bold leading-relaxed tracking-widest uppercase">
        Build. Compete. Conquer.
      </p>

      <div className="mt-10 flex flex-col sm:flex-row items-center gap-4">
        <Link 
          to="/events" 
          className="bg-white text-black font-semibold text-sm px-7 py-3.5 rounded-md hover:bg-gray-200 transition-colors uppercase tracking-wide shadow-lg"
        >
          START BUILDING
        </Link>
      </div>
    </div>
  );
}
