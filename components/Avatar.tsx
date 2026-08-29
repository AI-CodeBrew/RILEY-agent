const PALETTE = [
  "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400",
  "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  "bg-pink-500/15 text-pink-600 dark:text-pink-400",
  "bg-sky-500/15 text-sky-600 dark:text-sky-400",
];

function colorFor(name: string) {
  const hash = [...name].reduce((sum, c) => sum + c.charCodeAt(0), 0);
  return PALETTE[hash % PALETTE.length];
}

const SIZES = {
  sm: "h-8 w-8 text-xs",
  lg: "h-16 w-16 text-xl",
};

export function Avatar({ name, size = "sm" }: { name: string; size?: keyof typeof SIZES }) {
  const initials = name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full font-semibold ${SIZES[size]} ${colorFor(
        name
      )}`}
    >
      {initials || "?"}
    </span>
  );
}
