// PROTOTYPE (ticket 04) — thin shell: all behavior lives in lib/chat-engine.
import { NextResponse } from "next/server";
import { handleChat } from "@/lib/chat-engine";
import type { ChatRequest } from "@/lib/chat-engine";

export async function POST(request: Request) {
  let body: ChatRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  try {
    return NextResponse.json(handleChat(body));
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
