import { createExpressApp } from '../../server.ts';

export const config = {
  maxDuration: 30,
};

let appInstance: any = null;

export default function handler(req: any, res: any) {
  try {
    if (!appInstance) {
      appInstance = createExpressApp();
    }
    if (req && req.body !== undefined && req.readableEnded && !req._body) {
      req._body = true;
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
