import { registerHooks } from 'node:module';

// 앱의 Vite/TypeScript 확장자 생략 import를 Node 테스트에서도 해석한다.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) {
      return nextResolve(`${specifier}.ts`, context);
    }
    return nextResolve(specifier, context);
  },
});
