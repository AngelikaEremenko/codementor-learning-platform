/**
 * Возвращает корректную форму слова в зависимости от числа по правилам русского языка.
 * @param {number} n  Число, к которому подбирается форма.
 * @param {[string, string, string]} forms  [для 1, для 2-4, для 5+].
 * Пример: plural(3, ['балл', 'балла', 'баллов']) -> 'балла'
 */
export function plural(n, forms) {
  const abs = Math.abs(n) % 100
  if (abs >= 11 && abs <= 19) return forms[2]
  const r = abs % 10
  if (r === 1) return forms[0]
  if (r >= 2 && r <= 4) return forms[1]
  return forms[2]
}

export const points = (n) => plural(n, ['балл', 'балла', 'баллов'])
