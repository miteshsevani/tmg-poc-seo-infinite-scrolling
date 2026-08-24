export default function NotFound() {
  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <h1 className="text-3xl font-bold mb-4">Post Not Found</h1>
      <p>The post you are looking for does not exist.</p>
    </div>
  );
}