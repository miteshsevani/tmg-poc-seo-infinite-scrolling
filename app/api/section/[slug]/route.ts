import type { NextRequest } from "next/server";

export const revalidate = 60;

const PAGE_SIZE = 10;
const MAX_PAGE = 7;
const MAX_CONTENT_ITEMS = 99;
const MAX_CONTENT_PAGE = Math.ceil(MAX_CONTENT_ITEMS / PAGE_SIZE);
const VALID_SECTIONS = new Set(["posts"]);

type RouteContext = {
  params: Promise<{
    slug: string;
  }>;
};

function parsePageParam(value: string | null): number | null {
  if (!value) {
    return 1;
  }

  const page = Number(value);

  if (!Number.isInteger(page) || page < 1 || page > MAX_CONTENT_PAGE) {
    return null;
  }

  return page;
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { slug } = await params;

  if (!VALID_SECTIONS.has(slug)) {
    return Response.json({ error: "Unknown section." }, { status: 404 });
  }

  const page = parsePageParam(request.nextUrl.searchParams.get("page"));

  if (!page) {
    return Response.json(
      { error: `Page must be an integer between 1 and ${MAX_CONTENT_PAGE}.` },
      { status: 400 },
    );
  }

  const start = (page - 1) * PAGE_SIZE;
  const limit = Math.min(PAGE_SIZE, MAX_CONTENT_ITEMS - start);
  const response = await fetch(
    `https://jsonplaceholder.typicode.com/posts?_start=${start}&_limit=${limit}`,
    {
      next: {
        revalidate,
      },
    },
  );

  if (!response.ok) {
    return Response.json(
      { error: "Failed to fetch posts." },
      { status: 502 },
    );
  }

  const posts = await response.json();

  return Response.json({
    page,
    pageSize: PAGE_SIZE,
    maxPage: MAX_PAGE,
    maxContentItems: MAX_CONTENT_ITEMS,
    posts,
  });
}