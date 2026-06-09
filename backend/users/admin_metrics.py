"""Эндпоинт админ-аналитики: метрики, обосновывающие работу адаптивных
алгоритмов и ИИ-наставника. Доступен только staff/superuser.
"""
from datetime import timedelta

from django.db.models import Avg, Count, Q, F
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response

from users.models import User
from learning.models import Module, Task, UserProgress, TheoryProgress
from solutions.models import Submission
from assistant.models import HintRequest


def _percent(num, den):
    return round(100 * num / den, 1) if den else 0


@api_view(['GET'])
@permission_classes([IsAdminUser])
def admin_metrics(request):
    """Сводный JSON с метриками, нужными админу/преподавателю и для защиты диплома."""
    now = timezone.now()
    week_ago = now - timedelta(days=7)

    # ============ Пользователи ============
    user_qs = User.objects.filter(is_staff=False)
    total_users = user_qs.count()
    # «Активные за неделю» — те, кто отправил хотя бы одну submission
    active_users_7d = user_qs.filter(submissions__submitted_at__gte=week_ago).distinct().count()
    avg_points = user_qs.aggregate(p=Avg('points'))['p'] or 0

    # ============ Сводка по submissions ============
    sub_qs = Submission.objects.filter(user__is_staff=False)
    total_subs = sub_qs.count()
    accepted_subs = sub_qs.filter(status='accepted').count()
    avg_time = sub_qs.aggregate(t=Avg('time_spent'))['t'] or 0

    # ============ Эффект AI-подсказок ============
    with_hint = sub_qs.filter(used_hint=True)
    without_hint = sub_qs.filter(used_hint=False)
    wh_total = with_hint.count()
    wh_acc = with_hint.filter(status='accepted').count()
    wo_total = without_hint.count()
    wo_acc = without_hint.filter(status='accepted').count()

    # Распределение уровней подсказок
    hint_levels = list(
        HintRequest.objects.filter(user__is_staff=False)
        .values('hint_level').annotate(c=Count('id')).order_by('hint_level')
    )

    # ============ Сводка по модулям ============
    modules_data = []
    for m in Module.objects.filter(is_active=True).order_by('order').prefetch_related('tasks'):
        progress_qs = UserProgress.objects.filter(module=m, user__is_staff=False)
        students = progress_qs.count()

        module_subs = Submission.objects.filter(user__is_staff=False, task__module=m)
        avg_module_time = module_subs.filter(status='accepted').aggregate(t=Avg('time_spent'))['t'] or 0

        theory_qs = TheoryProgress.objects.filter(theory__module=m, user__is_staff=False)
        theories_total = m.theories.count()
        students_with_all_theory = 0
        if theories_total:
            from django.db.models import Count as DCount
            counts = theory_qs.values('user_id').annotate(c=DCount('id')).filter(c__gte=theories_total)
            students_with_all_theory = counts.count()

        modules_data.append({
            'id': m.id,
            'order': m.order,
            'title': m.title,
            'students': students,
            'avg_solve_time_sec': round(avg_module_time),
            'theories_total': theories_total,
            'students_passed_all_theories': students_with_all_theory,
            'tasks_total': m.tasks.count(),
        })

    # ============ Самые трудные задачи ============
    # Сортировка по доле успешных решений (по возрастанию). Минимум 5 попыток,
    # чтобы случайные «маленькие» задачи с одним фейлом не попадали в топ.
    hardest_tasks_raw = list(
        Task.objects.filter(submissions__user__is_staff=False)
        .annotate(
            total=Count('submissions'),
            accepted=Count('submissions', filter=Q(submissions__status='accepted')),
        )
        .filter(total__gte=5)
    )
    hardest_tasks_raw.sort(key=lambda t: (t.accepted / t.total) if t.total else 1)
    hardest_tasks = []
    for t in hardest_tasks_raw[:7]:
        hardest_tasks.append({
            'id': t.id,
            'title': t.title,
            'module': t.module.title,
            'difficulty': t.difficulty,
            'total_attempts': t.total,
            'accepted': t.accepted,
            'acceptance_rate': _percent(t.accepted, t.total),
        })

    # ============ Среднее число попыток на задачу ============
    # Берём по (user, task): submissions до первой accepted включительно
    avg_attempts_per_task_solved = (
        sub_qs.filter(status='accepted')
        .values('user_id', 'task_id')
        .distinct()
        .count()
    )
    # Это число решённых пар (user, task). А всего попыток (включая wrong) — total_subs.
    # Среднее число submissions на одно решение:
    avg_attempts = round(total_subs / avg_attempts_per_task_solved, 2) if avg_attempts_per_task_solved else 0

    return Response({
        'generated_at': now.isoformat(),
        'users': {
            'total': total_users,
            'active_7d': active_users_7d,
            'avg_points': round(avg_points, 1),
        },
        'submissions': {
            'total': total_subs,
            'accepted': accepted_subs,
            'acceptance_rate': _percent(accepted_subs, total_subs),
            'avg_time_sec': round(avg_time),
            'avg_attempts_per_solved_task': avg_attempts,
        },
        'hint_effect': {
            'with_hint_total': wh_total,
            'with_hint_accepted': wh_acc,
            'with_hint_rate': _percent(wh_acc, wh_total),
            'without_hint_total': wo_total,
            'without_hint_accepted': wo_acc,
            'without_hint_rate': _percent(wo_acc, wo_total),
            'levels_distribution': [
                {'level': h['hint_level'], 'count': h['c']} for h in hint_levels
            ],
        },
        'modules': modules_data,
        'hardest_tasks': hardest_tasks,
    })
