import React from "react";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost";
};

export default function Button({
  variant = "primary",
  className = "",
  ...props
}: Props) {
  const base =
    "inline-flex items-center justify-center rounded-full px-6 py-3 text-sm font-semibold transition-all duration-[120ms] focus:outline-none focus:ring-2 focus:ring-[#F6A63C]/60 disabled:opacity-60 disabled:cursor-not-allowed";
  const ease = "ease-[cubic-bezier(0.4,0,0.2,1)]";

  const styles =
    variant === "primary"
      ? "bg-[#F6A63C] text-black hover:opacity-90 hover:-translate-y-0.5 hover:shadow-lg"
      : "border border-white/20 bg-white/5 text-white hover:bg-white/10 hover:-translate-y-0.5 hover:shadow-md";

  return <button className={[base, ease, styles, className].join(" ")} {...props} />;
}