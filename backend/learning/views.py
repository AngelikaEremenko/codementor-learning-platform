import re

from rest_framework import permissions
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework import status as http_status
from django.shortcuts import get_object_or_404

from .models import Module, Task, UserProgress, Quiz, MiniTask, Theory, TheoryProgress
from .serializers import (
    ModuleListSerializer, ModuleDetailSerializer, TaskSerializer, UserProgressSerializer,
)
from solutions.models import Submission
from solutions.executor import check_submission


THEORY_COMPLETE_POINTS = 1  # поинт за полное прохождение одной теории модуля


def _theory_progress_map(user, theory_ids):
    """Возвращает {theory_id: TheoryProgress} для текущего пользователя."""
    qs = TheoryProgress.objects.filter(user=user, theory_id__in=theory_ids)
    return {tp.theory_id: tp for tp in qs}


def _award_theory_completion(user, progress: TheoryProgress) -> int:
    """Начисляет поинт за первое полное прохождение теории. Идемпотентно.

    Возвращает количество начисленных поинтов (0 или 1).
    """
    if progress.points_awarded or not progress.is_completed():
        return 0
    user.points += THEORY_COMPLETE_POINTS
    user.save(update_fields=['points'])
    progress.points_awarded = True
    progress.save(update_fields=['points_awarded', 'updated_at'])
    return THEORY_COMPLETE_POINTS


def _module_tasks_unlocked(user, module) -> bool:
    """Все теории модуля пройдены полностью? Админы — всегда True."""
    if user.is_staff or user.is_superuser:
        return True
    theories = list(module.theories.all())
    if not theories:
        return True
    progress_map = _theory_progress_map(user, [t.id for t in theories])
    for t in theories:
        tp = progress_map.get(t.id)
        if tp is None or not tp.is_completed():
            return False
    return True


def _module_unlocked_for_user(user, module, all_modules) -> bool:
    """Доступен ли модуль студенту? Открывается после полного прохождения предыдущего.
    Админ — всегда True. Первый модуль — всегда True."""
    if user.is_staff or user.is_superuser:
        return True
    # Берём предыдущий по order модуль из переданного списка (один запрос на дашборд)
    prev_modules = [m for m in all_modules if m.order < module.order]
    if not prev_modules:
        return True
    prev = max(prev_modules, key=lambda m: m.order)
    # Модуль пройден = все основные задачи решены
    main_task_ids = set(prev.tasks.filter(parent_task__isnull=True).values_list('id', flat=True))
    if not main_task_ids:
        return True
    accepted_ids = set(
        Submission.objects.filter(
            user=user, task_id__in=main_task_ids, status='accepted'
        ).values_list('task_id', flat=True)
    )
    return main_task_ids.issubset(accepted_ids)


@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
def module_list(request):
    modules = list(Module.objects.filter(is_active=True).prefetch_related('theories', 'tasks').order_by('order'))
    serializer = ModuleListSerializer(modules, many=True)
    data = serializer.data
    is_admin = request.user.is_staff or request.user.is_superuser
    from solutions.mastery import get_task_mastery
    for item, module in zip(data, modules):
        item['module_unlocked'] = _module_unlocked_for_user(request.user, module, modules)
        item['tasks_unlocked'] = _module_tasks_unlocked(request.user, module)

        # Прогресс по теориям модуля
        theories = list(module.theories.all())
        if theories:
            if is_admin:
                completed = len(theories)
            else:
                tp_map = _theory_progress_map(request.user, [t.id for t in theories])
                completed = sum(1 for t in theories if tp_map.get(t.id) and tp_map[t.id].is_completed())
            item['theories_total'] = len(theories)
            item['theories_completed'] = completed
        else:
            item['theories_total'] = 0
            item['theories_completed'] = 0

        # Прогресс по основным задачам модуля (вариации в счёт не идут)
        main_tasks = list(module.tasks.filter(parent_task__isnull=True))
        item['main_task_count'] = len(main_tasks)
        if is_admin:
            item['mastered_main_count'] = len(main_tasks)
        else:
            item['mastered_main_count'] = sum(
                1 for t in main_tasks
                if get_task_mastery(request.user, t) == 'mastered'
            )
    return Response(data)


@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
def module_detail(request, pk):
    module = get_object_or_404(
        Module.objects.prefetch_related('theories__mini_tasks', 'theories__quiz__questions', 'tasks__tags'),
        pk=pk, is_active=True,
    )
    # Запрет доступа к заблокированному модулю
    all_modules = list(Module.objects.filter(is_active=True).order_by('order'))
    if not _module_unlocked_for_user(request.user, module, all_modules):
        return Response(
            {'detail': 'Сначала пройдите предыдущий модуль.', 'module_locked': True},
            status=http_status.HTTP_403_FORBIDDEN,
        )
    theory_ids = [t.id for t in module.theories.all()]
    tp_map = _theory_progress_map(request.user, theory_ids)
    serializer = ModuleDetailSerializer(
        module,
        context={'user': request.user, 'theory_progress_map': tp_map},
    )
    return Response(serializer.data)


@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
def next_task(request, module_pk):
    """
    Возвращает следующую задачу с учётом адаптивного алгоритма.
    Если task_id передан — возвращает конкретную задачу.
    Доступ к задачам открыт только если все теории модуля пройдены.
    """
    module = get_object_or_404(Module, pk=module_pk, is_active=True)

    # Гейтинг: если хотя бы одна теория не пройдена — задачи закрыты
    if not _module_tasks_unlocked(request.user, module):
        return Response(
            {
                'detail': 'Сначала пройдите все теории и тесты этого модуля.',
                'tasks_locked': True,
            },
            status=http_status.HTTP_403_FORBIDDEN,
        )

    task_id = request.query_params.get('task_id')
    if task_id:
        task = get_object_or_404(Task, pk=task_id, module=module)
        # Проверяем последовательную разблокировку: если запрошена основная
        # задача, все более ранние основные задачи модуля должны быть mastered.
        # Вариации этому правилу не подчиняются (они выдаются адаптивно).
        is_admin = request.user.is_staff or request.user.is_superuser
        if not is_admin and task.parent_task_id is None:
            from solutions.mastery import get_task_mastery
            ordered_main = list(
                Task.objects.filter(module=module, parent_task__isnull=True)
                            .order_by('difficulty', 'order')
            )
            for t in ordered_main:
                if t.id == task.id:
                    break
                if get_task_mastery(request.user, t) != 'mastered':
                    return Response(
                        {
                            'detail': 'Сначала освойте предыдущие задачи модуля.',
                            'task_locked': True,
                        },
                        status=http_status.HTTP_403_FORBIDDEN,
                    )
        serializer = TaskSerializer(task, context={'user': request.user})
        return Response(serializer.data)

    progress, _ = UserProgress.objects.get_or_create(
        user=request.user,
        module=module,
        defaults={'solved_count': 0}
    )

    from solutions.mastery import get_task_mastery, get_next_variation

    # Берём только основные задачи (вариации не показываем в общем списке)
    main_tasks = list(
        Task.objects.filter(module=module, parent_task__isnull=True)
                    .order_by('difficulty', 'order')
    )

    # Идём по уровням сложности от 1 к 3. На каждом уровне сначала закрепляем
    # «слабо» решённые задачи через вариации, потом добиваем нерешённые
    # основные. К следующему уровню переходим, только когда текущий закрыт.
    accepted_main_ids = set(
        Submission.objects.filter(
            user=request.user, task__module=module, task__parent_task__isnull=True,
            status='accepted',
        ).values_list('task_id', flat=True)
    )

    for level in range(1, 4):
        for t in main_tasks:
            if t.difficulty != level:
                continue
            mastery = get_task_mastery(request.user, t)
            # 1. Задача решена «с трудом» — выдаём вариацию для закрепления
            if mastery == 'solved_weak':
                variation = get_next_variation(request.user, t)
                if variation:
                    data = TaskSerializer(variation).data
                    data['progress'] = UserProgressSerializer(progress).data
                    data['reinforcement_for'] = {'id': t.id, 'title': t.title}
                    return Response(data)
            # 2. Задача вообще не решена — выдаём её
            if t.id not in accepted_main_ids:
                data = TaskSerializer(t).data
                data['progress'] = UserProgressSerializer(progress).data
                return Response(data)
            # 3. Задача mastered — идём к следующей

    return Response({'detail': 'Все задачи модуля выполнены!', 'completed': True})


@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
def check_quiz(request, theory_pk):
    """
    Проверяет ответы на тест и сохраняет прогресс TheoryProgress.
    Тело: {"answers": {"<question_id>": "<a|b|c|d>", ...}}
    Возвращает: {"score", "total", "results", "passed", "theory_completed"}
    """
    theory = get_object_or_404(Theory, pk=theory_pk)
    quiz = get_object_or_404(Quiz, theory=theory)
    answers = request.data.get('answers', {})

    results = []
    score = 0
    questions = list(quiz.questions.all())
    for question in questions:
        given = answers.get(str(question.id), '').lower()
        is_correct = given == question.correct
        if is_correct:
            score += 1
        results.append({
            'id': question.id,
            'correct': is_correct,
            'correct_answer': question.correct,
            'explanation': question.explanation,
        })

    total = len(questions)
    progress, _ = TheoryProgress.objects.get_or_create(user=request.user, theory=theory)
    # Сохраняем лучший результат
    if score > progress.quiz_score or progress.quiz_total != total:
        progress.quiz_score = max(score, progress.quiz_score)
        progress.quiz_total = total
        progress.save(update_fields=['quiz_score', 'quiz_total', 'updated_at'])

    passed = total > 0 and score / total >= TheoryProgress.QUIZ_PASS_THRESHOLD
    points_earned = _award_theory_completion(request.user, progress)
    theory_completed = progress.is_completed()

    return Response({
        'score': score,
        'total': total,
        'results': results,
        'passed': passed,
        'theory_completed': theory_completed,
        'pass_threshold': TheoryProgress.QUIZ_PASS_THRESHOLD,
        'points_earned': points_earned,
        'points': request.user.points,
    })


@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
def check_mini_task(request, mini_pk):
    """
    Проверяет решение мини-задания внутри теории.
    Тело: {"code": "..."}
    Возвращает: {"status", "test_results", "passed", "error_message", "mini_tasks_passed"}
    """
    mini = get_object_or_404(MiniTask, pk=mini_pk)
    code = request.data.get('code', '')
    if not code.strip():
        return Response(
            {'detail': 'Код не может быть пустым.'},
            status=http_status.HTTP_400_BAD_REQUEST,
        )

    result = check_submission(code, mini.test_cases or [])
    tests_passed = result['status'] == 'accepted'

    # Дополнительная проверка: обязательные/запрещённые паттерны в коде.
    # Применяется только если тесты сами по себе прошли — иначе пользователь
    # сначала видит ошибку выполнения, а уже потом разбирается с формой записи.
    pattern_error = None
    if tests_passed:
        for rule in (mini.required_patterns or []):
            pat = rule.get('pattern', '')
            if pat and not re.search(pat, code, re.MULTILINE):
                pattern_error = rule.get(
                    'message',
                    'В вашем решении не использована требуемая конструкция.',
                )
                break
        if pattern_error is None:
            for rule in (mini.forbidden_patterns or []):
                pat = rule.get('pattern', '')
                if pat and re.search(pat, code, re.MULTILINE):
                    pattern_error = rule.get(
                        'message',
                        'В вашем решении использована запрещённая конструкция.',
                    )
                    break

    passed = tests_passed and pattern_error is None
    status_out = result['status']
    error_message = result['error_message']
    if tests_passed and pattern_error is not None:
        # Тесты прошли, но требование к коду не выполнено.
        status_out = 'wrong'
        error_message = pattern_error

    progress, _ = TheoryProgress.objects.get_or_create(user=request.user, theory=mini.theory)
    if passed and mini.id not in (progress.mini_tasks_passed or []):
        passed_list = list(progress.mini_tasks_passed or [])
        passed_list.append(mini.id)
        progress.mini_tasks_passed = passed_list
        progress.save(update_fields=['mini_tasks_passed', 'updated_at'])

    points_earned = _award_theory_completion(request.user, progress)

    return Response({
        'status': status_out,
        'test_results': result['results'],
        'error_message': error_message,
        'passed': passed,
        'mini_tasks_passed': progress.mini_tasks_passed or [],
        'theory_completed': progress.is_completed(),
        'points_earned': points_earned,
        'points': request.user.points,
    })


@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
def user_progress_list(request):
    progress_qs = UserProgress.objects.filter(user=request.user).select_related('module')
    serializer = UserProgressSerializer(progress_qs, many=True)
    return Response(serializer.data)
