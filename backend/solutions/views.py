from django.db.models import Max
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework import permissions, status
from django.shortcuts import get_object_or_404

from assistant.models import HintRequest
from learning.models import Task, UserProgress
from .models import Submission
from .serializers import SubmitSerializer, SubmissionSerializer
from .executor import check_submission, run_code

# Поинты за первое успешное решение основной задачи, по уровню сложности
TASK_POINTS = {1: 1, 2: 2, 3: 3}
# Поинты за первое успешное решение задачи-вариации (закрепляющей)
VARIATION_POINTS = {1: 1, 2: 1, 3: 2}
# Поинты за завершение всего модуля
MODULE_COMPLETE_POINTS = 5


def award_points(user, amount: int, reason: str = '') -> None:
    """Начисляет поинты пользователю."""
    user.points += amount
    user.save(update_fields=['points'])


def check_module_complete(user, module) -> bool:
    """Проверяет, решены ли все задачи модуля хотя бы один раз."""
    total_tasks = module.tasks.count()
    if total_tasks == 0:
        return False
    solved_ids = Submission.objects.filter(
        user=user, task__module=module, status='accepted'
    ).values_list('task_id', flat=True).distinct()
    return len(set(solved_ids)) >= total_tasks


@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
def submit_solution(request, task_pk):
    """Принять решение, проверить его и обновить прогресс."""
    try:
        task = get_object_or_404(Task, pk=task_pk)
        serializer = SubmitSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        code = serializer.validated_data['code']
        time_spent = serializer.validated_data.get('time_spent', 0)

        # Проверяем решение
        check_result = check_submission(code, task.test_cases or [])

        # Считаем максимальный уровень подсказки, который студент когда-либо
        # запрашивал по этой задаче — это и определит H в P-формуле.
        max_hint_level = (
            HintRequest.objects.filter(user=request.user, task=task)
            .aggregate(m=Max('hint_level'))['m']
            or 0
        )

        # Сохраняем сабмиссию
        submission = Submission.objects.create(
            user=request.user,
            task=task,
            code=code,
            status=check_result['status'],
            test_results=check_result['results'],
            error_message=check_result['error_message'],
            time_spent=time_spent,
            used_hint=(max_hint_level > 0),
            max_hint_level=max_hint_level,
        )

        is_solved = check_result['status'] == 'accepted'
        already_solved = Submission.objects.filter(
            user=request.user, task=task, status='accepted'
        ).exclude(pk=submission.pk).exists()

        points_earned = 0

        if is_solved and not already_solved:
            module = task.module
            progress, _ = UserProgress.objects.get_or_create(
                user=request.user,
                module=module,
                defaults={'solved_count': 0}
            )

            # Учёт прогресса: счётчик решённых задач. Решение о выдаче
            # закрепляющей задачи принимает модель мастерства в next_task
            # на основе P-скора (см. solutions/mastery.py и solutions/adaptive.py).
            progress.solved_count += 1
            progress.save(update_fields=['solved_count'])

            # Поинты за задачу: вариации стоят меньше основных
            if task.parent_task_id is not None:
                task_pts = VARIATION_POINTS.get(task.difficulty, 1)
            else:
                task_pts = TASK_POINTS.get(task.difficulty, 1)
            award_points(request.user, task_pts)
            points_earned += task_pts

            # Проверяем завершение модуля
            if check_module_complete(request.user, module):
                # Проверяем что бонус ещё не выдавался (нет предыдущих complete submissions до этого)
                prev_solved = Submission.objects.filter(
                    user=request.user, task__module=module, status='accepted'
                ).exclude(pk=submission.pk).values_list('task_id', flat=True).distinct()
                total_tasks = module.tasks.count()
                # Бонус выдаём если именно сейчас закрыли последнюю задачу
                if len(set(prev_solved)) == total_tasks - 1:
                    award_points(request.user, MODULE_COMPLETE_POINTS)
                    points_earned += MODULE_COMPLETE_POINTS

        # Обновляем объект user из БД чтобы получить актуальный баланс
        request.user.refresh_from_db()

        data = SubmissionSerializer(submission).data
        data['points_earned'] = points_earned
        data['points'] = request.user.points

        return Response(data, status=status.HTTP_201_CREATED)

    except Exception as e:
        import traceback
        return Response(
            {'detail': str(e), 'traceback': traceback.format_exc()},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
def run_code_inline(request):
    """
    Запускает произвольный C++-код без тест-кейсов -- используется в интерактивных примерах теории.
    Тело запроса: {"code": "...", "stdin": "..."}
    """
    code = request.data.get('code', '')
    stdin = request.data.get('stdin', '')
    if not code.strip():
        return Response({'stdout': '', 'stderr': 'Код не может быть пустым.', 'timed_out': False})
    result = run_code(code, stdin_data=stdin)
    return Response(result)


@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
def my_submissions(request):
    """История решений текущего пользователя."""
    task_id = request.query_params.get('task_id')
    qs = Submission.objects.filter(user=request.user).select_related('task')
    if task_id:
        qs = qs.filter(task_id=task_id)
    serializer = SubmissionSerializer(qs[:50], many=True)
    return Response(serializer.data)
