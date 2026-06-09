/**
 * Препроцессинг markdown-описаний задач: автоматически подписывает блоки
 * примера «**Ввод:**» и «**Вывод:**», если они следуют после заголовка
 * «## Пример».
 *
 * Условие срабатывания: после `## Пример` (или `### Пример`) идут два
 * последовательных code-блока с разделителем из пустых строк.
 * Если структура отличается (один блок, три и больше, фрагменты текста
 * между ними) — преобразование не применяется и markdown возвращается
 * как есть.
 */
const EXAMPLE_PATTERN =
  /(#{2,3}\s*Пример[^\n]*\n+)(```[a-zA-Z]*\n[\s\S]*?\n```)(\s*\n+)(```[a-zA-Z]*\n[\s\S]*?\n```)/g

export function labelExampleBlocks(markdown) {
  if (!markdown) return markdown
  return markdown.replace(
    EXAMPLE_PATTERN,
    (_match, heading, inputBlock, separator, outputBlock) =>
      `${heading}**Ввод:**\n\n${inputBlock}${separator}**Вывод:**\n\n${outputBlock}`,
  )
}
