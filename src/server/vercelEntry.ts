import { createExpressApp } from '../../server.ts';

let appInstance: any = null;

export default function handler(req: any, res: any) {
  try {
    if (!appInstance) {
      appInstance = createExpressApp();
    }
    return appInstance(req, res);
  } catch (err: any) {
    console.error('Vercel API Handler Error:', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(
      JSON.stringify({
        ok: false,
        error: 'Erro interno na inicialização da API.',
        details: err?.message || String(err),
      })
    );
  }
}
