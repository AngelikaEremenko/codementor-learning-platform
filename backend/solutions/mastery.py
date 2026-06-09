"""Модель мастерства освоения задачи.

Для каждой пары (пользователь, задача) определяется один из трёх статусов:

    not_attempted  — нет ни одного успешного решения задачи;
    solved_weak    — есть успешное решение, но оно «слабое» (P-скор не достиг
                     порога STRONG_SCORE_THRESHOLD), и при этом у задачи
                     остались нерешённые закрепляющие вариации;
    mastered       — есть хотя бы одно «сильное» решение основной задачи или
                     любой её вариации, либо решены все вариации.

Решение о выдаче закрепляющей задачи принимается только на основании этой
модели. Сама P-формула описана в adaptive.py.
"""
from solutions.models import Submission
from solutions.adaptive import score_for_submission, STRONG_SCORE_THRESHOLD


def is_strong_submission(sub: 'Submission') -> bool:
    """«Сильным» считается решение, у которого P-скор достиг порога."""
    return (
        sub.status == 'accepted'
        and score_for_submission(sub) >= STRONG_SCORE_THRESHOLD
    )


def has_any_strong(user, task) -> bool:
    """Есть ли у пользователя хотя бы одно «сильное» решение этой задачи?"""
    accepted = Submission.objects.filter(user=user, task=task, status='accepted')
    return any(is_strong_submission(s) for s in accepted)


def has_any_accepted(user, task) -> bool:
    return Submission.objects.filter(user=user, task=task, status='accepted').exists()


def get_task_mastery(user, task) -> str:
    """Возвращает один из статусов: not_attempted / solved_weak / mastered.

    Логика:
    1. mastered — если по основной задаче или по любой её вариации есть
       «сильное» решение (P достиг порога).
    2. mastered — если есть accepted и у задачи нет вариаций (закреплять нечем).
    3. mastered — если решены все вариации (даже «слабо»).
    4. solved_weak — есть accepted, но условие закрепления ещё не выполнено.
    5. not_attempted — нет ни одной accepted submission.
    """
    if has_any_strong(user, task):
        return 'mastered'

    variations = list(task.variations.all())

    for v in variations:
        if has_any_strong(user, v):
            return 'mastered'

    if has_any_accepted(user, task):
        if not variations:
            return 'mastered'
        solved_variations = sum(1 for v in variations if has_any_accepted(user, v))
        if solved_variations >= len(variations):
            return 'mastered'
        return 'solved_weak'

    return 'not_attempted'


def get_next_variation(user, parent_task):
    """Возвращает первую нерешённую вариацию задачи или None."""
    for v in parent_task.variations.all().order_by('order', 'id'):
        if not has_any_accepted(user, v):
            return v
    return None
