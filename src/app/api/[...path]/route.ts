import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: { path: string[] } }) {
    return handleProxy(req, params);
}

export async function POST(req: NextRequest, { params }: { params: { path: string[] } }) {
    return handleProxy(req, params);
}

async function handleProxy(req: NextRequest, params: { path: string[] }) {
    // МАГИЯ ЗДЕСЬ: Убираем слэш на конце адреса, если он там случайно есть
    const NGROK_URL = (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/$/, '');

    if (!NGROK_URL) {
        return NextResponse.json({ error: "Не настроен NEXT_PUBLIC_API_URL" }, { status: 500 });
    }

    const path = params.path.join('/');
    const search = req.nextUrl.search;

    // Получаем красивый и правильный URL: https://домен.ngrok.app/api/info
    const targetUrl = `${NGROK_URL}/api/${path}${search}`;

    const headers = new Headers();
    headers.set('ngrok-skip-browser-warning', 'true');
    headers.set('User-Agent', 'MyCustomApp/1.0');

    if (req.method !== 'GET') {
        headers.set('Content-Type', req.headers.get('Content-Type') || 'application/json');
    }

    const options: RequestInit = {
        method: req.method,
        headers,
    };

    if (req.method !== 'GET' && req.method !== 'HEAD') {
        options.body = await req.text();
    }

    try {
        const response = await fetch(targetUrl, options);
        const data = await response.text();

        return new NextResponse(data, {
            status: response.status,
            headers: {
                'Content-Type': response.headers.get('Content-Type') || 'application/json',
            },
        });
    } catch (error) {
        console.error("Proxy error:", error);
        return NextResponse.json({ error: "Ошибка соединения с бэкендом (Ngrok)" }, { status: 500 });
    }
}