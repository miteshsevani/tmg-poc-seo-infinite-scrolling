import { notFound } from "next/navigation";

type PostPageProps = {
  params: Promise<{ id: string }>;
};

export default async function PostPage({ params }: PostPageProps) {
  const { id } = await params;
  const response = await fetch(`https://jsonplaceholder.typicode.com/posts/${id}`);
  const post = await response.json();
  
  if (!post.id) {
    notFound();
  }

  return (
    <div>
      <h1 className="text-3xl font-bold mb-4">{post.title}</h1>
      <p>{post.body}</p>
    </div>
  );
}