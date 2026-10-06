// 라이트/다크 전환. 첫 화면 깜빡임을 막으려고 저장된 값은 index.html의 인라인 스크립트가 먼저 적용한다.
export const THEME_KEY = 'theme';
const THEME_COLOR = { light: '#e9dec8', dark: '#1a1511' };

export function createThemeToggle(
  button: HTMLElement,
  root: HTMLElement,
  meta: HTMLMetaElement | null,
  storage: Pick<Storage, 'setItem'> | null,
  onChange: (dark: boolean) => void,
) {
  let dark = root.dataset.theme === 'dark';
  const apply = () => {
    if (dark) root.dataset.theme = 'dark';
    else delete root.dataset.theme;
    meta?.setAttribute('content', dark ? THEME_COLOR.dark : THEME_COLOR.light);
    button.setAttribute('aria-label', dark ? '라이트 모드로 전환' : '다크 모드로 전환');
    onChange(dark);
  };
  apply();
  button.addEventListener('click', () => {
    dark = !dark;
    apply();
    try { storage?.setItem(THEME_KEY, dark ? 'dark' : 'light'); } catch { /* 저장 불가(사생활 보호 모드 등)면 이번 방문만 적용 */ }
  });
}
