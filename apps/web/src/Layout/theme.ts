export const themeStorageKey = 'phoenix-theme'

export type Theme = 'light' | 'dark'

/**
 * 在 hydration 前同步执行，避免深色主题先闪一下浅色。
 * 字符串直接内联到 HTML，不能引用模块作用域外的变量。
 */
export const themeInitScript = `(function(){try{var theme=localStorage.getItem('${themeStorageKey}');var isDark=theme==='dark'||(theme===null&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',isDark)}catch(error){}})()`

export function setTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark')

  try {
    window.localStorage.setItem(themeStorageKey, theme)
  } catch {
    // 隐私模式等场景写入失败时，只保留当前会话的切换结果。
  }
}

export function toggleTheme() {
  const isDark = document.documentElement.classList.contains('dark')
  setTheme(isDark ? 'light' : 'dark')
}
