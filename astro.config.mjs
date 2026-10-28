import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';

import coresJson from './data/guild/cores.json';

/** Pra onde as URLs de um core só apontam. */
const principal = (coresJson.cores.find((core) => core.principal) ?? coresJson.cores[0]).slug;

export default defineConfig({
  integrations: [tailwind()],
  output: 'static',
  site: 'https://hailtotheking.com.br',
  base: '/',

  /**
   * As URLs antigas, de quando só existia UM core.
   *
   * Elas foram compartilhadas no Discord e em link de perfil, e quebrar
   * link que já circulou é custo que cai em quem não pediu. Em build
   * estático o Astro gera uma página de redirecionamento pra cada uma.
   *
   * Apontam pro core principal, que é o que essas URLs sempre significaram.
   */
  redirects: {
    '/core': `/core/${principal}`,
    '/core/membros': `/core/${principal}/membros`,
    '/core/mythic': `/core/${principal}/mythic`,
    '/core/progressao': `/core/${principal}/progressao`,
    '/chronicle': `/core/${principal}/chronicle`,
    '/hall-da-fama': `/core/${principal}/hall-da-fama`,
  },
});
