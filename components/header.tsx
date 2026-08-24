import Image from "next/image";

export default function Header() {
  return (
    <header className="flex flex-col items-center gap-6 text-center sm:items-start sm:text-left pb-8 pt-8 border-b-2 border-zinc-200 dark:border-zinc-800 mb-4">
      <Image
        className="dark:invert"
        src="/next.svg"
        alt="Next.js logo"
        width={100}
        height={20}
        priority
      />
      <h1>My Next JS Blog</h1>      
    </header>
  );
}