"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

interface ListPaginationProps {
  page: number;
  totalItems: number;
  pageSize?: number;
  onPageChange: (page: number) => void;
  locale?: string;
}

function pageItems(currentPage: number, totalPages: number): Array<number | "ellipsis"> {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);
  const pages = new Set([1, totalPages, currentPage - 1, currentPage, currentPage + 1]);
  const ordered = [...pages]
    .filter((page) => page >= 1 && page <= totalPages)
    .sort((a, b) => a - b);
  const result: Array<number | "ellipsis"> = [];
  ordered.forEach((page, index) => {
    if (index > 0 && page - ordered[index - 1] > 1) result.push("ellipsis");
    result.push(page);
  });
  return result;
}

export function ListPagination({
  page,
  totalItems,
  pageSize = 20,
  onPageChange,
  locale = "en",
}: ListPaginationProps) {
  const totalPages = Math.ceil(totalItems / pageSize);
  if (totalPages <= 1) return null;
  const zh = locale === "zh";
  const safePage = Math.min(Math.max(page, 1), totalPages);

  return (
    <nav
      aria-label={zh ? "分页" : "Pagination"}
      className="mt-5 flex flex-wrap items-center justify-center gap-1.5"
    >
      <button
        type="button"
        aria-label={zh ? "上一页" : "Previous page"}
        disabled={safePage === 1}
        onClick={() => onPageChange(safePage - 1)}
        className="inline-flex size-9 items-center justify-center rounded-lg border border-border/60 bg-card text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-35"
      >
        <ChevronLeft className="size-4 rtl:rotate-180" />
      </button>
      {pageItems(safePage, totalPages).map((item, index) =>
        item === "ellipsis" ? (
          <span
            key={`ellipsis-${index}`}
            className="inline-flex size-9 items-center justify-center text-sm text-muted-foreground/60"
          >
            …
          </span>
        ) : (
          <button
            key={item}
            type="button"
            aria-current={item === safePage ? "page" : undefined}
            aria-label={zh ? `第 ${item} 页` : `Page ${item}`}
            onClick={() => onPageChange(item)}
            className={`inline-flex size-9 items-center justify-center rounded-lg border text-sm font-medium transition-colors ${item === safePage ? "border-primary bg-primary text-primary-foreground" : "border-border/60 bg-card text-muted-foreground hover:bg-muted/50 hover:text-foreground"}`}
          >
            {item}
          </button>
        ),
      )}
      <button
        type="button"
        aria-label={zh ? "下一页" : "Next page"}
        disabled={safePage === totalPages}
        onClick={() => onPageChange(safePage + 1)}
        className="inline-flex size-9 items-center justify-center rounded-lg border border-border/60 bg-card text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-35"
      >
        <ChevronRight className="size-4 rtl:rotate-180" />
      </button>
    </nav>
  );
}
