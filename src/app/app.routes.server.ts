import { RenderMode, ServerRoute } from '@angular/ssr';

/**
 * @description Modo de renderização por rota no servidor.
 *
 * Todas as rotas usam `RenderMode.Server` (SSR sob demanda), e não `Prerender`: o conteúdo depende da sessão do
 * cliente (token/perfil) e de dados financeiros que mudam — HTML estático gerado no build seria obsoleto
 * (e poderia expor dados de um perfil a outro). O SSR por requisição gera o HTML já com os dados,
 * que o cliente hidrata sem refazer chamadas.
 */
export const serverRoutes: ServerRoute[] = [
  {
    path: '**',
    renderMode: RenderMode.Server,
  },
];
