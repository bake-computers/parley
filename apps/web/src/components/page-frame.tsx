export function PageFrame() {
  return (
    <div className="fixed inset-0 pointer-events-none z-40 p-3 md:p-4">
      <div className="w-full h-full border border-white/6 relative">
        <span className="absolute -top-px -left-px w-3 h-3 border-t border-l border-white/20" />
        <span className="absolute -top-px -right-px w-3 h-3 border-t border-r border-white/20" />
        <span className="absolute -bottom-px -left-px w-3 h-3 border-b border-l border-white/20" />
        <span className="absolute -bottom-px -right-px w-3 h-3 border-b border-r border-white/20" />

        <span className="absolute top-2 left-3 text-[10px] font-mono text-white/25 tracking-widest uppercase hidden md:block">
          SYS.PARLEY // v1.0.0
        </span>
        <span className="absolute bottom-2 right-3 text-[10px] font-mono text-white/25 tracking-widest uppercase hidden md:block">
          ONLINE
        </span>
      </div>
    </div>
  );
}
