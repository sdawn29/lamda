export function SplashScreen() {
  return (
    <div className="flex h-svh w-full items-center justify-center bg-background animate-in fade-in duration-300">
      <div className="flex size-20 items-center justify-center rounded-2xl bg-[#1c1c1c] shadow-xl ring-1 ring-white/5">
        <span
          className="select-none font-heading text-6xl font-black leading-none"
          style={{ color: "#d4a017" }}
        >
          Λ
        </span>
      </div>
    </div>
  )
}
