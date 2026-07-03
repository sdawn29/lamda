export function SplashScreen() {
  return (
    <div className="flex h-svh w-full animate-in items-center justify-center bg-background duration-300 fade-in">
      <div className="flex size-20 items-center justify-center rounded-2xl bg-[#1c1c1c] shadow-xl ring-1 ring-white/5">
        <span
          className="font-heading text-6xl leading-none font-black select-none"
          style={{ color: "#d4a017" }}
        >
          Λ
        </span>
      </div>
    </div>
  )
}
