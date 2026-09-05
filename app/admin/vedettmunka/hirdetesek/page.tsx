import Link from "next/link";
import { adminGetJobPosts } from "@/lib/vedettmunka/data";
import {
  JOB_STATUS_LABELS,
  WORK_TYPE_LABELS,
} from "@/lib/vedettmunka/types";
import JobActionButtons from "./JobActionButtons";

export const metadata = {
  title: "Admin – VédettKarrier lehetőségek",
};

export const dynamic = "force-dynamic";

const STATUS_COLOR: Record<string, string> = {
  draft: "bg-gray-100 text-gray-500",
  submitted: "bg-amber-100 text-amber-700",
  under_review: "bg-blue-100 text-blue-700",
  needs_revision: "bg-orange-100 text-orange-700",
  approved: "bg-green-100 text-green-700",
  published: "bg-green-600 text-white",
  rejected: "bg-red-100 text-red-700",
  expired: "bg-gray-100 text-gray-500",
  archived: "bg-gray-100 text-gray-400",
};

interface PageProps {
  searchParams: Promise<{
    status?: string;
  }>;
}

export default async function AdminHirdetesekPage({
  searchParams,
}: PageProps) {
  const { status } = await searchParams;

  const posts = await adminGetJobPosts(status);

  const statusOptions = [
    "submitted",
    "under_review",
    "needs_revision",
    "approved",
    "published",
    "rejected",
    "archived",
  ];

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <Link
        href="/admin/vedettmunka"
        className="text-sm text-sni-brand-blue hover:underline"
      >
        ← VédettKarrier admin
      </Link>

      <h1 className="mt-3 text-2xl font-bold text-sni-text">
        Hirdetések ({posts.length})
      </h1>

      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href="/admin/vedettmunka/hirdetesek"
          className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
            !status
              ? "bg-sni-brand-navy text-white"
              : "bg-gray-100 text-gray-600"
          }`}
        >
          Összes
        </Link>

        {statusOptions.map((s) => (
          <Link
            key={s}
            href={`/admin/vedettmunka/hirdetesek?status=${s}`}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
              status === s
                ? "bg-sni-brand-navy text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {JOB_STATUS_LABELS[s as keyof typeof JOB_STATUS_LABELS]}
          </Link>
        ))}
      </div>

      <div className="mt-5 flex flex-col gap-4">
        {posts.length === 0 && (
          <p className="text-sm text-gray-400">
            Nincs találat.
          </p>
        )}

        {posts.map((post) => {
          const company =
            (
              post.employers as {
                company_name: string;
              } | null
            )?.company_name ?? "–";

          return (
            <div
              key={post.id}
              className="rounded-2xl border border-gray-100 bg-white p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        STATUS_COLOR[post.status] ??
                        "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {JOB_STATUS_LABELS[post.status]}
                    </span>

                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        post.work_type === "szellemi"
                          ? "bg-blue-100 text-blue-700"
                          : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {WORK_TYPE_LABELS[post.work_type]}
                    </span>

                    <span className="text-xs text-gray-400">
                      {new Date(post.created_at).toLocaleDateString(
                        "hu-HU"
                      )}
                    </span>
                  </div>

                  <h2 className="mt-1 font-bold text-sni-brand-navy">
                    {post.title}
                  </h2>

                  <p className="text-sm text-gray-600">
                    {company} · {post.city}
                  </p>

                  {post.application_email && (
                    <p className="text-xs text-gray-400">
                      Jelentkezési e-mail: {post.application_email}
                    </p>
                  )}

                  {post.admin_note && (
                    <p className="mt-2 rounded-lg bg-amber-50 px-3 py-1.5 text-xs text-amber-700">
                      Admin megjegyzés: {post.admin_note}
                    </p>
                  )}
                </div>

                <JobActionButtons
                  jobId={post.id}
                  currentStatus={post.status}
                />
              </div>

              {post.support_description && (
                <p className="mt-3 border-t border-gray-50 pt-3 text-sm text-gray-600">
                  <strong>Miben kapok segítséget:</strong>{" "}
                  {post.support_description.slice(0, 200)}
                  {post.support_description.length > 200 ? "..." : ""}
                </p>
              )}

              <div className="mt-3">
                <Link
                  href={`/vedettmunka/allasok/${post.id}`}
                  target="_blank"
                  className="text-xs text-sni-brand-blue hover:underline"
                >
                  Előnézet →
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}