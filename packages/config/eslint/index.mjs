import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    settings: {
      next: {
        rootDir: 'apps/web',
      },
      react: {
        version: '19.3',
      },
    },
  },
  {
    files: ['apps/desktop/haolai/**/*.{ts,tsx,js,mjs}'],
    rules: {
      // 桌面 Vite SPA 不使用 Next 路由或图片优化。
      '@next/next/no-img-element': 'off',
      '@next/next/no-html-link-for-pages': 'off',
    },
  },
  globalIgnores([
    '**/.next/**',
    '**/out/**',
    '**/build/**',
    '**/dist/**',
    'apps/*/deploy/**',
    '**/next-env.d.ts',
  ]),
])

export default eslintConfig
