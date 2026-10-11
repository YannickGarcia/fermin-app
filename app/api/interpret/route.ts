/**
 * POST /api/interpret — sends one instruction to Jev and returns Slots.
 * The API key stays on the server. Without TYPESAFE_API_KEY the route answers
 * 501 and the command bar keeps using the built-in rules.
 */
import {NextResponse} from 'next/server';
import {JEV_ENDPOINT, type JevContext, type JevResponse, buildJevRequest, slotsFromJev} from '@/lib/voice/jev';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const key = process.env.TYPESAFE_API_KEY;
  if (!key) return NextResponse.json({enabled: false}, {status: 501});

  const body = (await req.json()) as {text?: string; context?: JevContext};
  if (!body.text?.trim() || !body.context) return NextResponse.json({error: 'text and context are required'}, {status: 400});

  const started = Date.now();
  try {
    const res = await fetch(JEV_ENDPOINT, {
      method: 'POST',
      headers: {Authorization: `Bearer ${key}`, 'Content-Type': 'application/json'},
      body: JSON.stringify(buildJevRequest(body.text, body.context)),
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) return NextResponse.json({error: `Jev answered ${res.status}`}, {status: 502});
    const json = (await res.json()) as JevResponse;
    return NextResponse.json({enabled: true, slots: slotsFromJev(json), model: json.model, ms: Date.now() - started});
  } catch (e) {
    return NextResponse.json({error: e instanceof Error ? e.message : 'Jev request failed'}, {status: 502});
  }
}
