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
    "inline-flex items-center justify-center rounded-full px-6 py-3 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-[#F6A63C]/60 disabled:opacity-60 disabled:cursor-not-allowed";

  const styles =
    variant === "primary"
      ? "bg-[#F6A63C] text-black hover:opacity-90"
      : "border border-white/20 bg-white/5 text-white hover:bg-white/10";

  return <button className={[base, styles, className].join(" ")} {...props} />;
}