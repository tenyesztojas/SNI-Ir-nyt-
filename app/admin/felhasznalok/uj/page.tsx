import Link from "next/link";
import { UserPlus } from "lucide-react";
import AdminCreateUserForm from "@/components/AdminCreateUserForm";

export default function AdminCreateUserPage() {
  return (
    <div className="mx-auto max-w-lg px-4 py-8 sm:px-6">
      <Link href="/admin/felhasznalok" className="text-sm text-sni-brand-blue hover:underline">
        ← Felhasználók
      </Link>
      <div className="mt-3 flex items-center gap-3">
        <UserPlus className="text-sni-brand-teal" size={26} />
        <h1 className="text-2xl font-bold text-sni-text">Felhasználó felvitele (admin)</h1>
      </div>
      <p className="mt-1 text-sm text-gray-500">
        Olyan személynek hozz létre fiókot, aki nem tud magától regisztrálni.
        Az email-megerősítést átugorjuk — azonnal bejelentkezhet.
      </p>

      <div className="mt-6">
        <AdminCreateUserForm />
      </div>
    </div>
  );
}
