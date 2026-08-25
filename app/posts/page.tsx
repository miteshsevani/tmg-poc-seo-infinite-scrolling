import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PostsPage, { type Post } from "./PostsPage";

export const revalidate = 60;

const PAGE_SIZE = 10;
const MAX_PAGE = 5;
const MAX_CONTENT_ITEMS = 100;
const SECTION_SLUG = "posts";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

type PostsRouteProps = {
  searchParams?: Promise<{
    page?: string | string[];
  }>;
};

function parsePageParam(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;

  if (!raw) {
    return 1;
  }

  const page = Number(raw);

  if (!Number.isInteger(page) || page < 1 || page > MAX_PAGE) {
    notFound();
  }

  return page;
}

async function getPostsPage(page: number): Promise<Post[]> {
  const start = (page - 1) * PAGE_SIZE;

  const response = await fetch(
    `https://jsonplaceholder.typicode.com/posts?_start=${start}&_limit=${PAGE_SIZE}`,
    {
      next: {
        revalidate,
      },
    },
  );

  if (!response.ok) {
    throw new Error("Failed to fetch posts.");
  }

  return response.json();
}

function getPageUrl(page: number): string {
  return `/posts?page=${page}`;
}

export async function generateMetadata({
  searchParams,
}: PostsRouteProps): Promise<Metadata> {
  const params = await searchParams;
  const page = parsePageParam(params?.page);
  const title =
    page === 1
      ? "Posts | Daily Telegraph"
      : `Posts - Page ${page} | Daily Telegraph`;
  const description =
    page === 1
      ? "Latest stories from the Daily Telegraph posts section."
      : `Latest stories from the Daily Telegraph posts section, page ${page}.`;

  return {
    title,
    description,
    alternates: {
      // SEO: each paginated URL canonicalizes to itself so page N remains
      // independently indexable instead of being treated as duplicate page 1.
      canonical: new URL(getPageUrl(page), SITE_URL),
    },
    openGraph: {
      title,
      description,
      url: new URL(getPageUrl(page), SITE_URL),
      type: "website",
    },
  };
}

export default async function Page({ searchParams }: PostsRouteProps) {
  const params = await searchParams;
  const page = parsePageParam(params?.page);
  const posts = await getPostsPage(page);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `Posts - Page ${page}`,
    itemListOrder: "https://schema.org/ItemListOrderDescending",
    numberOfItems: posts.length,
    itemListElement: posts.map((post, index) => ({
      "@type": "ListItem",
      position: (page - 1) * PAGE_SIZE + index + 1,
      url: new URL(`/posts/${post.id}`, SITE_URL).toString(),
      name: post.title,
    })),
  };

  return (
    <main className="flex-1 bg-zinc-50 px-6 py-10 font-sans text-zinc-950 dark:bg-black dark:text-zinc-50">
      <header className="mx-auto mb-10 max-w-3xl border-b border-zinc-200 pb-6 dark:border-zinc-800">
        <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Section
        </p>
        <h1 className="text-5xl font-bold">Posts</h1>
        <p className="mt-4 text-lg text-zinc-600 dark:text-zinc-400">
          Latest stories from the section.
        </p>
      </header>

      <PostsPage
        sectionSlug={SECTION_SLUG}
        initialPage={page}
        initialPosts={posts}
        maxPage={MAX_PAGE}
        maxContentItems={MAX_CONTENT_ITEMS}
      />

      {/* SEO: real crawlable links are included in SSR HTML so discovery of
          page 2+ does not depend on JavaScript or IntersectionObserver. */}
      <nav aria-label="Pagination" className="sr-only">
        <ul>
          {page > 1 ? (
            <li>
              <a href={getPageUrl(page - 1)}>Previous page</a>
            </li>
          ) : null}

          {Array.from({ length: MAX_PAGE }, (_, index) => index + 1).map(
            (pageNumber) => (
              <li key={pageNumber}>
                <a href={getPageUrl(pageNumber)}>Page {pageNumber}</a>
              </li>
            ),
          )}

          {page < MAX_PAGE ? (
            <li>
              <a href={getPageUrl(page + 1)}>Next page</a>
            </li>
          ) : null}
        </ul>
      </nav>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />
    </main>
  );
}