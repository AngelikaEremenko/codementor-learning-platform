# -*- coding: utf-8 -*-
import re

from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework import permissions, status
from django.shortcuts import get_object_or_404
from django.conf import settings

from learning.models import Task, Module
from .models import HintRequest

MAX_HINT_LEVEL = 2

# Стоимость подсказок по уровням. Уровень 1 (сократический вопрос) — бесплатно:
# наводящие вопросы поощряют рефлексию, а не подменяют решение. Уровень 2
# (конкретные средства языка) — платный, чтобы исключить тривиальную выдачу
# решения по запросу.
HINT_COST_BY_LEVEL = {1: 0, 2: 3}


def _normalize_code(code: str) -> str:
    """Нормализует код для сравнения: убирает комментарии и все пробелы."""
    if not code:
        return ''
    code = re.sub(r'//.*', '', code)
    code = re.sub(r'/\*.*?\*/', '', code, flags=re.DOTALL)
    return re.sub(r'\s+', '', code)


def _calculate_hint_level(user, task, user_code: str) -> int:
    """Уровень подсказки растёт, если студент просит ещё одну, не изменив код.
    Если код изменился — сбрасываем на 1 (студент сдвинулся).
    """
    last = (
        HintRequest.objects
        .filter(user=user, task=task)
        .order_by('-requested_at')
        .first()
    )
    if not last:
        return 1
    if _normalize_code(user_code) == _normalize_code(last.user_code):
        return min(last.hint_level + 1, MAX_HINT_LEVEL)
    return 1


def generate_hint_stub(task: Task, user_code: str, hint_level: int = 1) -> str:
    """Заглушка если API ключ не задан.

    Делаем уровни визуально разными, чтобы система оставалась осмысленной
    даже без LLM. Уровень 1 — наводящий вопрос, уровень 2 — статическая
    подсказка из задачи (если она есть) или общие технические указания.
    """
    if hint_level == 1:
        return (
            f"Подсказка от ИИ-наставника временно недоступна (нет ключа Groq).\n"
            f"Подумай: какую информацию задача получает на входе и какое "
            f"преобразование над ней нужно выполнить, чтобы получить "
            f"требуемый результат?"
        )
    if task.hint_text:
        return task.hint_text
    return (
        f"Подсказка для задачи «{task.title}»:\n\n"
        "1. Определи входные и выходные данные.\n"
        "2. Подбери подходящие типы и средства ввода-вывода стандартной библиотеки C++.\n"
        "3. Соедини шаги в одну программу.\n\n"
        "Если код выдаёт ошибку — проверь синтаксис: точки с запятой, фигурные скобки, типы данных."
    )


LEVEL_GUIDE = {
    1: (
        "УРОВЕНЬ 1 — СОКРАТИЧЕСКИЙ ВОПРОС. Сформулируй ОДИН наводящий "
        "вопрос, который заставит студента подумать о следующем шаге. "
        "СТРОГО ЗАПРЕЩЕНО:\n"
        "— называть функции, библиотеки, типы, ключевые слова C++ "
        "(никаких `cin`, `cout`, `int`, `for`, `if`, `<iostream>`);\n"
        "— описывать действие в повелительном наклонении («объяви», "
        "«прочитай», «выведи»);\n"
        "— давать список шагов решения.\n"
        "Подсказка должна быть РОВНО ОДНИМ вопросом на 8–18 слов. "
        "Пример формата: «Что нужно сначала получить от пользователя, "
        "чтобы посчитать результат?»"
    ),
    2: (
        "УРОВЕНЬ 2 — КОНКРЕТНЫЕ СРЕДСТВА. Назови КОНКРЕТНУЮ функцию, "
        "библиотеку, тип данных или конструкцию C++ и коротко поясни, "
        "ЗАЧЕМ она здесь нужна. Можно перечислить 1–3 инструмента. "
        "СТРОГО ЗАПРЕЩЕНО:\n"
        "— писать готовый код решения или фрагмент кода;\n"
        "— перечислять последовательность действий в повелительном "
        "наклонении («объяви x, прочитай через cin, выведи x+y»);\n"
        "— давать решение прямо в подсказке.\n"
        "Формулируй так, чтобы студент понял, ЧТО использовать, но "
        "сам решил, КАК соединить. 2–3 коротких предложения. "
        "Пример формата: «Для ввода чисел с клавиатуры пригодится "
        "`cin` из `<iostream>` — он считывает значения по очереди. "
        "Для типа целых чисел используй `int`.»"
    ),
}


def _build_curriculum_context(task: Task) -> str:
    """Формирует блок «ИЗУЧЕНО / НЕ ИЗУЧЕНО» для промпта.

    Студент изучил всё из модулей с order ≤ order текущей задачи.
    Темы из последующих модулей — под запретом: наставник не должен
    предлагать решения через них.
    """
    current_order = task.module.order
    modules = list(Module.objects.filter(is_active=True).order_by('order'))
    learned = [m for m in modules if m.order <= current_order]
    upcoming = [m for m in modules if m.order > current_order]

    learned_lines = []
    for m in learned:
        marker = '►' if m.order == current_order else '✓'
        suffix = ' ← текущий модуль задачи' if m.order == current_order else ''
        concepts = m.concepts.strip() if m.concepts else ''
        line = f"{marker} Модуль {m.order} «{m.title}»{suffix}"
        if concepts:
            line += f"\n   Изученные концепции: {concepts}"
        learned_lines.append(line)
    learned_block = '\n'.join(learned_lines) if learned_lines else '(пока ничего)'

    upcoming_block = '\n'.join(
        f"× Модуль {m.order} «{m.title}»" for m in upcoming
    )
    if not upcoming_block:
        upcoming_block = '(всё уже изучено)'

    return (
        "=== ЧТО СТУДЕНТ УЖЕ ИЗУЧИЛ ===\n"
        f"{learned_block}\n\n"
        "=== ЧТО СТУДЕНТ ЕЩЁ НЕ ИЗУЧАЛ (НЕ ПРЕДЛАГАТЬ!) ===\n"
        f"{upcoming_block}\n\n"
        "ВАЖНО: предлагай решение ТОЛЬКО через концепции из «уже изучено». "
        "Не упоминай функции, библиотеки и приёмы из «не изучено» — студент о них пока не знает "
        "и не сможет применить.\n\n"
    )


def build_prompt(task: Task, user_code: str, hint_level: int, last_result: dict = None) -> str:
    code_section = (
        f"```cpp\n{user_code}\n```" if user_code.strip()
        else "(студент ещё ничего не написал — только пустой шаблон)"
    )

    result_section = ""
    if last_result:
        result_status = last_result.get('status', '')
        error_msg = last_result.get('error_message', '')
        test_results = last_result.get('test_results', [])

        if result_status == 'error' and error_msg:
            result_section = f"Последняя попытка — ОШИБКА:\n{error_msg}\n\n"
        elif result_status == 'wrong' and test_results:
            failed = [r for r in test_results if not r.get('passed')]
            if failed:
                ex = failed[0]
                inp = ex.get('input', '').strip()
                result_section = (
                    "Последняя попытка — НЕВЕРНЫЙ ОТВЕТ.\n"
                    f"Тест {ex['test']}:"
                    + (f" вход «{inp}»," if inp else "")
                    + f" ожидалось «{ex['expected']}», получено «{ex.get('got', '')}».\n\n"
                )
        elif result_status == 'timeout':
            result_section = "Последняя попытка — TIMEOUT (вероятно, бесконечный цикл).\n\n"

    level_guide = LEVEL_GUIDE.get(hint_level, LEVEL_GUIDE[MAX_HINT_LEVEL])
    curriculum = _build_curriculum_context(task)

    return (
        "Ты — ИИ-наставник образовательной платформы CodeMentor для обучения C++.\n"
        "Твоя цель — помочь студенту САМОМУ дойти до решения. Никогда не пиши "
        "готовый код решения целиком, даже если кажется, что это короче. "
        "Студент должен думать сам — твои подсказки лишь направляют его мысль.\n\n"
        f"{curriculum}"
        f"=== ЗАДАЧА ===\n{task.description}\n\n"
        f"Уровень сложности: {task.get_difficulty_display()}\n\n"
        f"=== КОД СТУДЕНТА ===\n{code_section}\n\n"
        f"{result_section}"
        "=== ОБЯЗАТЕЛЬНЫЙ АНАЛИЗ КОДА ===\n"
        "Перед ответом мысленно ответь на вопросы:\n"
        "1) Что студент УЖЕ написал? Какие конструкции, функции, переменные присутствуют?\n"
        "2) Подключён ли заголовок и есть ли `using namespace std;`?\n"
        "3) Чего конкретно НЕ ХВАТАЕТ для решения именно этой задачи?\n"
        "4) Все ли предлагаемые концепции есть в списке «уже изучено»?\n"
        "Подсказка должна касаться ТОЛЬКО того, чего нет — следующего шага, а не уже сделанного.\n\n"
        f"=== ИНСТРУКЦИЯ ===\n{level_guide}\n\n"
        "ОБЩИЕ ПРАВИЛА:\n"
        "— Никогда не выдавай полное решение целиком.\n"
        "— ЗАПРЕЩЕНО советовать то, что в коде уже есть. Если студент написал `cout`, "
        "не говори ему «используй cout». Ищи следующий недостающий шаг.\n"
        "— ЗАПРЕЩЕНО использовать функции/конструкции из ещё не изученных модулей. "
        "Только то, что есть в списке «уже изучено».\n"
        "— Если в коде есть `using namespace std;` — пиши имена БЕЗ префикса `std::` "
        "(пиши `cout`, а не `std::cout`).\n"
        "— Будь МАКСИМАЛЬНО кратким. Никаких списков, шагов, подзаголовков.\n"
        "— Не повторяй условие задачи и не пересказывай код студента.\n"
        "— Никаких вступлений и заключений — только суть подсказки.\n"
        "— Пиши на русском, простыми короткими предложениями."
    )


def generate_hint_groq(
    task: Task,
    user_code: str,
    api_key: str,
    hint_level: int,
    last_result: dict = None,
) -> str:
    try:
        from groq import Groq
        client = Groq(api_key=api_key)

        # Чем выше уровень — тем больше токенов разрешаем
        max_tokens = {1: 80, 2: 160}.get(hint_level, 160)

        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "user", "content": build_prompt(task, user_code, hint_level, last_result)}
            ],
            max_tokens=max_tokens,
            temperature=0.3,
        )
        return response.choices[0].message.content
    except Exception as e:
        return f"ИИ-наставник временно недоступен: {e}\n\nСтатическая подсказка:\n{generate_hint_stub(task, user_code, hint_level)}"


@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
def get_hint(request, task_pk):
    """Получить подсказку от ИИ-наставника.

    Стоимость зависит от уровня: уровень 1 (наводящий вопрос) — бесплатно,
    уровень 2 (конкретные средства языка) — 3 поинта.
    """
    user = request.user
    is_unlimited = user.is_staff or user.is_superuser

    task = get_object_or_404(Task, pk=task_pk)
    user_code = request.data.get('code', '')
    last_result = request.data.get('last_result', None)

    hint_level = _calculate_hint_level(user, task, user_code)
    cost = HINT_COST_BY_LEVEL.get(hint_level, 0)

    if not is_unlimited and cost > 0 and user.points < cost:
        return Response(
            {'detail': f'Для подсказки уровня {hint_level} нужно {cost} поинтов, у вас {user.points}.'},
            status=status.HTTP_402_PAYMENT_REQUIRED,
        )

    api_key = getattr(settings, 'GROQ_API_KEY', '')

    if api_key:
        hint_text = generate_hint_groq(task, user_code, api_key, hint_level, last_result)
    else:
        hint_text = generate_hint_stub(task, user_code, hint_level)

    if not is_unlimited and cost > 0:
        user.points -= cost
        user.save(update_fields=['points'])

    HintRequest.objects.create(
        user=user,
        task=task,
        user_code=user_code,
        hint_text=hint_text,
        hint_level=hint_level,
    )

    return Response({
        'hint': hint_text,
        'points': user.points,
        'hint_level': hint_level,
        'cost': cost,
    })
