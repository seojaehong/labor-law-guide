import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const INTAKE_TOKEN = "winhr_call_32719";
// server-side only: service role key for storage bypass RLS
const SUPABASE_URL = "https://mewqgevgdgghhatqtuos.supabase.co";
const SUPABASE_SERVICE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ld3FnZXZnZGdnaGhhdHF0dW9zIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjcxNTUxMCwiZXhwIjoyMDg4MjkxNTEwfQ.cfDNqZoMmoUTzSWJtt4y90R0gPMr2yRVA-OAj_ZSl-Y";

export async function POST(req: NextRequest) {
  const token =
    req.headers.get("x-intake-token") ||
    req.nextUrl.searchParams.get("token");

  if (token !== INTAKE_TOKEN) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const category = (formData.get("category") as string) || "general";
    const capturedAt =
      (formData.get("capturedAt") as string) || new Date().toISOString();
    const callerHint = (formData.get("callerHint") as string) || "";
    const source = (formData.get("source") as string) || "iphone";

    if (!file) {
      return NextResponse.json({ error: "no file attached" }, { status: 400 });
    }

    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `${category}/${ts}_${safeName}`;

    const buffer = Buffer.from(await file.arrayBuffer());

    // Supabase Storage에 업로드
    const { error: uploadError } = await supabase.storage
      .from("call-recordings")
      .upload(storagePath, buffer, {
        contentType: file.type || "audio/m4a",
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json(
        { error: "upload failed", detail: uploadError.message },
        { status: 500 }
      );
    }

    // 메타데이터 DB 저장
    const { data: dbRow, error: dbError } = await supabase
      .from("call_intake")
      .insert({
        storage_path: storagePath,
        file_name: file.name,
        file_size: buffer.length,
        category,
        captured_at: capturedAt,
        caller_hint: callerHint,
        source,
        status: "received",
      })
      .select()
      .single();

    if (dbError) {
      // DB 실패해도 파일은 저장됨 - 부분 성공
      return NextResponse.json({
        ok: true,
        warning: "db_insert_failed",
        storagePath,
        file: file.name,
        size: buffer.length,
      });
    }

    return NextResponse.json({
      ok: true,
      id: dbRow?.id,
      storagePath,
      file: file.name,
      size: buffer.length,
      category,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ status: "intake-call live", version: "1.1" });
}
