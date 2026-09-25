/** 반복 호출해도 문구나 표시 상태가 바뀔 때만 DOM을 갱신한다. */
export function createHint(element: HTMLElement) {
  const mainEl = element.querySelector<HTMLElement>('.hint-main')!;
  const subEl = element.querySelector<HTMLElement>('.hint-sub')!;
  let previousMain: string | null = null;
  let previousSub = '';
  return (main: string | null, sub = '') => {
    if (main === previousMain && sub === previousSub) return;
    previousMain = main;
    previousSub = sub;
    if (main) {
      mainEl.textContent = main;
      subEl.textContent = sub;
      element.classList.add('is-shown');
    } else {
      element.classList.remove('is-shown');
    }
  };
}
