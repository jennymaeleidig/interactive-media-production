// The Chat mimic's message API (ticket 08): ONE POST per turn carrying
// `start | resume | option` and answering with the turn's lines, the pending
// choice set (or completion), and the session's variables. All behavior lives
// in lib/chat-engine.ts; this route is only the HTTP shell.
//
// The Recreation's chat makes no outbound request of any kind — this route is
// the visitor's own machine talking to itself, and the engine's session state
// lives in server memory.
//
// SPDX-License-Identifier: CC0-1.0
import { NextResponse } from 'next/server';
import { handleChat, parseChatRequest } from '@/lib/chat-engine';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }
  const body = parseChatRequest(raw);
  if (!body) {
    return NextResponse.json({ error: 'invalid request' }, { status: 400 });
  }
  try {
    return NextResponse.json(handleChat(body));
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
