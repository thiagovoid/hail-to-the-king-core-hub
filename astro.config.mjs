import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';

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
    '/core': '/core/nemesis',
    '/core/membros': '/core/nemesis/membros',
    '/core/mythic': '/core/nemesis/mythic',
    '/core/progressao': '/core/nemesis/progressao',
  },
});
