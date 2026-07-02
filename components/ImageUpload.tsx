"use client";

import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const MAX_IMAGES = 3;
const MAX_MB = 5;
const ACCEPT = "image/jpeg,image/png,image/webp,image/heic";

export interface ImageUploadRef {
  uploadAll: () => Promise<string[]>;
}

interface Props {
  folder: string; // "reviews" | "places"
}

const ImageUpload = forwardRef<ImageUploadRef, Props>(function ImageUpload({ folder }, ref) {
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useImperativeHandle(ref, () => ({
    uploadAll: async () => {
      if (files.length === 0) return [];
      setError("");

      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      const uid = user?.id ?? "anon";
      const urls: string[] = [];

      for (const file of files) {
        const ext = file.name.split(".").pop() ?? "jpg";
        const path = `${folder}/${uid}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

        const { error: err } = await supabase.storage
          .from("place-images")
          .upload(path, file, { contentType: file.type });

        if (err) {
          setError("Kép feltöltése sikertelen: " + err.message);
          return [];
        }

        const { data } = supabase.storage.from("place-images").getPublicUrl(path);
        urls.push(data.publicUrl);
      }

      return urls;
    },
  }));

  function addFiles(list: FileList | null) {
    if (!list) return;
    setError("");
    const arr = Array.from(list).filter((f) => {
      if (f.size > MAX_MB * 1024 * 1024) {
        setError(`Max. ${MAX_MB} MB / kép.`);
        return false;
      }
      return true;
    });
    const next = [...files, ...arr].slice(0, MAX_IMAGES);
    setFiles(next);
    setPreviews(next.map((f) => URL.createObjectURL(f)));
  }

  function remove(i: number) {
    const next = files.filter((_, j) => j !== i);
    setFiles(next);
    setPreviews(next.map((f) => URL.createObjectURL(f)));
  }

  return (
    <div>
      <p className="text-sm font-medium text-gray-700 mb-2">
        Képek (max. {MAX_IMAGES} db, {MAX_MB} MB/db)
      </p>

      {previews.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-3">
          {previews.map((src, i) => (
            <div key={i} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" className="h-24 w-24 rounded-xl object-cover border border-gray-200" />
              <button
                type="button"
                onClick={() => remove(i)}
                className="absolute -top-2 -right-2 rounded-full bg-white border border-gray-200 p-0.5 shadow-sm text-gray-500 hover:text-red-500"
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {files.length < MAX_IMAGES && (
        <>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex items-center gap-2 rounded-xl border-2 border-dashed border-gray-300 px-4 py-3 text-sm text-gray-500 hover:border-sni-brand-teal hover:text-sni-brand-teal transition-colors"
          >
            <ImagePlus size={18} />
            Kép hozzáadása ({files.length}/{MAX_IMAGES})
          </button>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            multiple
            className="hidden"
            onChange={(e) => addFiles(e.target.files)}
          />
        </>
      )}

      {error && <p className="mt-1.5 text-sm text-red-600">{error}</p>}
    </div>
  );
});

export default ImageUpload;
