"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

export type Post = {
  id: number;
  userId: number;
  title: string;
  body: string;
};

type PostsPageProps = {
  sectionSlug: string;
  initialPage: number;
  initialPosts: Post[];
  maxPage: number;
  maxContentItems: number;
};

type PostsApiResponse = {
  page: number;
  pageSize: number;
  maxPage: number;
  maxContentItems: number;
  posts: Post[];
};

type PostBatch = {
  page: number;
  posts: Post[];
};

type FetchDirection = "previous" | "next";

function getPageFromUrl(): number | null {
  const page = Number(new URL(window.location.href).searchParams.get("page"));

  return Number.isInteger(page) ? page : null;
}

export default function PostsPage({
  sectionSlug,
  initialPage,
  initialPosts,
  maxPage,
  maxContentItems,
}: PostsPageProps) {
  const [batches, setBatches] = useState<PostBatch[]>([
    { page: initialPage, posts: initialPosts },
  ]);
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingDirection, setLoadingDirection] =
    useState<FetchDirection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastFailedDirection, setLastFailedDirection] =
    useState<FetchDirection | null>(null);

  const topSentinelRef = useRef<HTMLDivElement | null>(null);
  const bottomSentinelRef = useRef<HTMLDivElement | null>(null);
  const topObserverRef = useRef<IntersectionObserver | null>(null);
  const bottomObserverRef = useRef<IntersectionObserver | null>(null);
  const isLoadingRef = useRef(false);
  const pageRefs = useRef(new Map<number, HTMLElement>());
  const suppressHistoryRef = useRef(false);
  const didInitialScrollRef = useRef(false);
  const pendingPrependScrollHeightRef = useRef<number | null>(null);

  const lowestLoadedPage = Math.min(...batches.map((batch) => batch.page));
  const highestLoadedPage = Math.max(...batches.map((batch) => batch.page));
  const maxContentPage = Math.ceil(maxContentItems / 10);
  const hasReachedBeginning = lowestLoadedPage <= 1;
  const hasReachedEnd = highestLoadedPage >= maxContentPage;

  const syncPageToHistory = useCallback((page: number) => {
    const url = new URL(window.location.href);

    if (url.searchParams.get("page") === String(page)) {
      return;
    }

    url.searchParams.set("page", String(page));

    // UX: pushState records page-turning infinite-scroll steps in both scroll
    // directions without Next router navigation, avoiding an RSC fetch for data
    // already loaded client-side.
    window.history.pushState({ page }, "", url);
  }, []);

  const setPageRef = useCallback(
    (page: number) => (element: HTMLElement | null) => {
      if (element) {
        pageRefs.current.set(page, element);
      } else {
        pageRefs.current.delete(page);
      }
    },
    [],
  );

  const updateCurrentPageFromViewport = useCallback(() => {
    if (suppressHistoryRef.current || pageRefs.current.size === 0) {
      return;
    }

    const viewportMarker = window.innerHeight * 0.35;
    let bestPage = currentPage;
    let bestDistance = Number.POSITIVE_INFINITY;

    pageRefs.current.forEach((element, page) => {
      const rect = element.getBoundingClientRect();
      const containsMarker =
        rect.top <= viewportMarker && rect.bottom > viewportMarker;
      const distance = containsMarker
        ? 0
        : Math.min(
            Math.abs(rect.top - viewportMarker),
            Math.abs(rect.bottom - viewportMarker),
          );

      if (distance < bestDistance) {
        bestDistance = distance;
        bestPage = page;
      }
    });

    const historyPage = Math.min(bestPage, maxPage);

    if (historyPage !== currentPage) {
      setCurrentPage(historyPage);
      syncPageToHistory(historyPage);
    }
  }, [currentPage, maxPage, syncPageToHistory]);

  const scrollToPage = useCallback((page: number) => {
    const pageElement = pageRefs.current.get(page);

    if (!pageElement) {
      return false;
    }

    suppressHistoryRef.current = true;
    pageElement.scrollIntoView({ block: "start", behavior: "auto" });
    setCurrentPage(page);

    window.setTimeout(() => {
      suppressHistoryRef.current = false;
      updateCurrentPageFromViewport();
    }, 100);

    return true;
  }, [updateCurrentPageFromViewport]);

  const fetchPage = useCallback(
    async (direction: FetchDirection) => {
      if (isLoadingRef.current) {
        return;
      }

      const page =
        direction === "next" ? highestLoadedPage + 1 : lowestLoadedPage - 1;

      if (page < 1 || page > maxContentPage) {
        return;
      }

      isLoadingRef.current = true;
      setIsLoading(true);
      setLoadingDirection(direction);
      setError(null);
      setLastFailedDirection(null);

      if (direction === "previous") {
        pendingPrependScrollHeightRef.current = document.body.scrollHeight;
      }

      try {
        const response = await fetch(
          `/api/section/${encodeURIComponent(sectionSlug)}?page=${page}`,
          {
            headers: {
              Accept: "application/json",
            },
          },
        );

        if (!response.ok) {
          throw new Error("Unable to load more posts.");
        }

        const data = (await response.json()) as PostsApiResponse;

        setBatches((existingBatches) => {
          if (existingBatches.some((batch) => batch.page === data.page)) {
            return existingBatches;
          }

          return [
            ...existingBatches,
            { page: data.page, posts: data.posts },
          ].sort((a, b) => a.page - b.page);
        });
      } catch {
        pendingPrependScrollHeightRef.current = null;
        setLastFailedDirection(direction);
        setError(
          direction === "previous"
            ? "Something went wrong while loading earlier posts."
            : "Something went wrong while loading more posts.",
        );
      } finally {
        isLoadingRef.current = false;
        setIsLoading(false);
        setLoadingDirection(null);
      }
    },
    [highestLoadedPage, lowestLoadedPage, maxContentPage, sectionSlug],
  );

  const fetchPreviousPage = useCallback(async () => {
    if (hasReachedBeginning) {
      return;
    }

    await fetchPage("previous");
  }, [fetchPage, hasReachedBeginning]);

  const fetchNextPage = useCallback(async () => {
    if (hasReachedEnd) {
      return;
    }

    await fetchPage("next");
  }, [fetchPage, hasReachedEnd]);

  useLayoutEffect(() => {
    const previousScrollHeight = pendingPrependScrollHeightRef.current;

    if (previousScrollHeight === null) {
      return;
    }

    pendingPrependScrollHeightRef.current = null;
    suppressHistoryRef.current = true;
    window.scrollBy({ top: document.body.scrollHeight - previousScrollHeight });

    window.setTimeout(() => {
      suppressHistoryRef.current = false;
      updateCurrentPageFromViewport();
    }, 100);
  }, [batches, updateCurrentPageFromViewport]);

  useEffect(() => {
    if (!topSentinelRef.current || hasReachedBeginning) {
      topObserverRef.current?.disconnect();
      return;
    }

    topObserverRef.current?.disconnect();
    topObserverRef.current = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          void fetchPreviousPage();
        }
      },
      {
        root: null,
        rootMargin: "600px 0px",
        threshold: 0,
      },
    );

    topObserverRef.current.observe(topSentinelRef.current);

    return () => {
      topObserverRef.current?.disconnect();
    };
  }, [fetchPreviousPage, hasReachedBeginning]);

  useEffect(() => {
    if (!bottomSentinelRef.current || hasReachedEnd) {
      bottomObserverRef.current?.disconnect();
      return;
    }

    bottomObserverRef.current?.disconnect();
    bottomObserverRef.current = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          void fetchNextPage();
        }
      },
      {
        root: null,
        rootMargin: "600px 0px",
        threshold: 0,
      },
    );

    bottomObserverRef.current.observe(bottomSentinelRef.current);

    return () => {
      bottomObserverRef.current?.disconnect();
    };
  }, [fetchNextPage, hasReachedEnd]);

  useEffect(() => {
    if (hasReachedBeginning) {
      topObserverRef.current?.disconnect();
    }
  }, [hasReachedBeginning]);

  useEffect(() => {
    if (hasReachedEnd) {
      bottomObserverRef.current?.disconnect();
    }
  }, [hasReachedEnd]);

  useEffect(() => {
    let frameId = 0;

    const handleScroll = () => {
      window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(updateCurrentPageFromViewport);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleScroll);
    frameId = window.requestAnimationFrame(updateCurrentPageFromViewport);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleScroll);
    };
  }, [batches, updateCurrentPageFromViewport]);

  useEffect(() => {
    // If a user lands directly on /posts?page=4, the server has rendered only
    // page 4 for SEO; on hydration, align the viewport with that page section.
    if (initialPage > 1 && !didInitialScrollRef.current) {
      didInitialScrollRef.current = true;
      scrollToPage(initialPage);
    }
  }, [initialPage, scrollToPage]);

  useEffect(() => {
    const handlePopState = () => {
      const page = getPageFromUrl();

      if (!page || page < 1 || page > maxPage) {
        return;
      }

      if (!scrollToPage(page)) {
        window.location.href = `/posts?page=${page}`;
      }
    };

    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [maxPage, scrollToPage]);

  return (
    <section className="mx-auto max-w-3xl" aria-label="Posts list">
      {!hasReachedBeginning ? (
        <div ref={topSentinelRef} aria-hidden="true" className="h-20" />
      ) : null}

      {isLoading && loadingDirection === "previous" ? (
        <p className="mb-8 text-center text-sm font-medium text-zinc-500 dark:text-zinc-400">
          Loading earlier posts…
        </p>
      ) : null}

      <div className="space-y-12">
        {batches.map((batch) => (
          <section
            key={batch.page}
            ref={setPageRef(batch.page)}
            data-page={batch.page}
            aria-labelledby={`posts-page-${batch.page}`}
            className="scroll-mt-8"
          >
            <h2
              id={`posts-page-${batch.page}`}
              className="mb-6 text-sm font-semibold uppercase tracking-wide text-zinc-500"
            >
              Page {batch.page}
            </h2>
            <ol className="space-y-8">
              {batch.posts.map((post) => (
                <li
                  key={post.id}
                  className="border-b border-zinc-200 pb-8 dark:border-zinc-800"
                >
                  <article>
                    <h3 className="text-2xl font-semibold">
                      <Link
                        href={`/posts/${post.id}`}
                        className="text-zinc-950 underline-offset-4 hover:underline dark:text-zinc-50"
                      >
                        {post.title}
                      </Link>
                    </h3>
                    <p className="mt-3 text-zinc-600 dark:text-zinc-400">
                      {post.body}
                    </p>
                  </article>
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>

      {error ? (
        <div
          role="alert"
          className="mt-8 rounded-lg border border-red-200 bg-red-50 p-4 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
        >
          <p>{error}</p>
          <button
            type="button"
            onClick={() =>
              void fetchPage(lastFailedDirection ?? "next")
            }
            className="mt-3 rounded-md bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800"
          >
            Retry
          </button>
        </div>
      ) : null}

      {isLoading && loadingDirection === "next" ? (
        <p className="mt-8 text-center text-sm font-medium text-zinc-500 dark:text-zinc-400">
          Loading more posts…
        </p>
      ) : null}

      {!hasReachedEnd ? (
        <div ref={bottomSentinelRef} aria-hidden="true" className="h-20" />
      ) : (
        <p className="mt-10 rounded-lg border border-zinc-200 p-4 text-center text-sm font-medium text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
          End of section
        </p>
      )}
    </section>
  );
}