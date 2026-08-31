import { getAllEnrollments } from "@/lib/academy/data";
import ExportButtons from "./ExportButtons";

export default async function ExportokPage() {
  const enrollments = await getAllEnrollments();
  return (
    <div>
      <h1 className="text-xl font-bold text-sni-text mb-2">CSV Exportok</h1>
      <p className="text-sm text-gray-500 mb-6">
        Az exportok az összes beiratkozást tartalmazzák. {enrollments.length} bejegyzés.
      </p>
      <ExportButtons enrollments={enrollments} />
    </div>
  );
}
