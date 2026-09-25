import { cn } from "@/lib/cn";

const GRADIENTS = [
  "from-orange-400 to-pink-500",
  "from-violet-600 to-fuchsia-500",
  "from-sky-400 to-indigo-500",
  "from-emerald-400 to-teal-500",
  "from-rose-400 to-fuchsia-500",
];

function gradientFor(name: string) {
  const hash = [...name].reduce((sum, c) => sum + c.charCodeAt(0), 0);
  return GRADIENTS[hash % GRADIENTS.length];
}

const SIZES = {
  sm: "h-8 w-8 text-xs",
  md: "h-11 w-11 text-sm",
};

/** Chat-only avatar — a solid gradient disc with the first initial, unlike the app-wide tinted Avatar. */
export function ChatAvatar({ name, size = "md" }: { name: string; size?: keyof typeof SIZES }) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-linear-to-br font-semibold text-white",
        SIZES[size],
        gradientFor(name)
      )}
    >
      {name.trim()[0]?.toUpperCase() || "?"}
    </span>
  );
}
