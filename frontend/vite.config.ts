import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icone.png', 'icons.svg'],
      workbox: {
        // iOS: o SW precisa assumir o controle imediatamente após a instalação,
        // senão a permissão/inscrição de notificação falha silenciosamente.
        skipWaiting: true,
        clientsClaim: true,
      },
      manifest: {
        // iOS 16.4+ pode ignorar o registro de notificações sem um id único
        id: '/',
        name: 'Meu Ponto',
        short_name: 'Meu Ponto',
        description: 'Controle de ponto pessoal',
        start_url: '/',
        scope: '/',
        theme_color: '#000000',
        background_color: '#000000',
        display: 'standalone',
        icons: [
          {
            src: 'icone.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'icone.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'icone.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      }
    })
  ],
  server: {
    port: 80,
    proxy: {
      '/api': {
        target: 'http://localhost:3333',
        changeOrigin: true
      }
    }
  },
  resolve: {
    alias: {
      '@': '/src'
    }
  }
});
