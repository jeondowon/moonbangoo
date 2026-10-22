import { defineConfig } from 'vite';

// GitHub Pages 프로젝트 사이트(https://jeondowon.github.io/moonbangoo/)는 하위 경로에서 서비스되므로
// 빌드와 빌드 결과 미리보기(vite preview)만 base를 저장소 이름으로 맞춘다 (개발 서버는 루트 그대로).
export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ? '/moonbangoo/' : '/',
  build: {
    rollupOptions: {
      input: { menu: 'index.html', card: 'card.html', coin: 'coin.html' },
    },
  },
}));
